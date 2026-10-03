using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Mordomo.World;
using UnityEngine;

namespace Mordomo.Commands
{
    /// <summary>
    /// Liga o corpo (Unity) ao cérebro (Node) por WebSocket.
    /// Recebe mensagens {"type":"unity_command","payload":{...}}, entrega ao dispatcher e devolve o resultado.
    /// Se a conexão cair, tenta de novo sozinho.
    /// </summary>
    public class MordomoCommandReceiver : MonoBehaviour
    {
        [Tooltip("Endereço do cérebro visto pelo Quest: ws://IP-DO-PC:PORTA/ws")]
        public string serverUrl = "ws://192.168.1.4:3010/ws";

        [Tooltip("Endereço usado ao apertar Play no editor do Unity (mesmo PC do Node)")]
        public string editorServerUrl = "ws://localhost:3010/ws";

        public float reconnectSeconds = 3f;
        public MordomoCommandDispatcher dispatcher;
        public WorldRegistry world;

        private readonly ConcurrentQueue<string> incoming = new ConcurrentQueue<string>();
        private readonly ConcurrentQueue<string> outgoing = new ConcurrentQueue<string>();
        private CancellationTokenSource cancellation;
        private volatile bool connected;
        private volatile bool helloPending;

        public bool IsConnected => connected;
        public string ActiveUrl => Application.isEditor ? editorServerUrl : serverUrl;

        [Serializable]
        private class Envelope
        {
            public string type;
            public MordomoCommand payload;
        }

        [Serializable]
        private class ResultEnvelope
        {
            public string type = "unity_result";
            public MordomoCommandResult payload;
        }

        [Serializable]
        private class ObjectInfo
        {
            public string id;
            public string displayName;
            public bool interactive;
        }

        [Serializable]
        private class HelloPayload
        {
            public List<string> actions = new List<string>();
            public List<ObjectInfo> objects = new List<ObjectInfo>();
            public string holding = string.Empty;
        }

        [Serializable]
        private class HelloEnvelope
        {
            public string type = "unity_hello";
            public HelloPayload payload = new HelloPayload();
        }

        private void OnEnable()
        {
            cancellation = new CancellationTokenSource();
            string url = ActiveUrl;
            CancellationToken token = cancellation.Token;
            Task.Run(() => ConnectLoop(url, token));

            if (dispatcher != null && dispatcher.controller != null)
            {
                dispatcher.controller.StateChanged += ReportState;
            }
        }

        // O cérebro recebe de novo o estado do corpo (ex.: o que está na mão) sempre que uma ação termina.
        private void ReportState()
        {
            if (connected)
            {
                helloPending = true;
            }
        }

        private void OnDisable()
        {
            cancellation?.Cancel();
            connected = false;
            if (dispatcher != null && dispatcher.controller != null)
            {
                dispatcher.controller.StateChanged -= ReportState;
            }
        }

        private void Update()
        {
            if (helloPending)
            {
                helloPending = false;
                outgoing.Enqueue(JsonUtility.ToJson(BuildHello()));
            }

            // Os comandos chegam em outra thread; a execução acontece aqui, na thread principal do Unity.
            while (incoming.TryDequeue(out string message))
            {
                Handle(message);
            }
        }

        private void Handle(string message)
        {
            Envelope envelope;
            try
            {
                envelope = JsonUtility.FromJson<Envelope>(message);
            }
            catch (ArgumentException)
            {
                return;
            }

            // O mesmo WebSocket transmite logs do agente; só "unity_command" interessa ao corpo.
            if (envelope == null || envelope.type != "unity_command" || dispatcher == null)
            {
                return;
            }

            MordomoCommandResult result = dispatcher.Dispatch(envelope.payload);
            Debug.Log($"[Mordomo] comando {result.action}: {(result.ok ? "ok" : "recusado - " + result.error)}");
            outgoing.Enqueue(JsonUtility.ToJson(new ResultEnvelope { payload = result }));
        }

        private HelloEnvelope BuildHello()
        {
            HelloEnvelope hello = new HelloEnvelope();
            if (dispatcher != null)
            {
                hello.payload.actions.AddRange(dispatcher.KnownActions);
                if (dispatcher.controller != null)
                {
                    hello.payload.holding = dispatcher.controller.HeldId ?? string.Empty;
                }
            }

            if (world != null)
            {
                foreach (WorldObject worldObject in world.Objects)
                {
                    hello.payload.objects.Add(new ObjectInfo
                    {
                        id = worldObject.id,
                        displayName = worldObject.displayName,
                        interactive = worldObject.interactive
                    });
                }
            }

            return hello;
        }

        private async Task ConnectLoop(string url, CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    using (ClientWebSocket socket = new ClientWebSocket())
                    {
                        await socket.ConnectAsync(new Uri(url), token);
                        connected = true;
                        helloPending = true;
                        Debug.Log($"[Mordomo] conectado ao cérebro em {url}");

                        Task sender = SendLoop(socket, token);
                        await ReceiveLoop(socket, token);
                        connected = false;
                        await sender;
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception error)
                {
                    if (connected)
                    {
                        Debug.LogWarning($"[Mordomo] conexão com o cérebro caiu: {error.Message}");
                    }
                }

                connected = false;
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(Mathf.Max(1f, reconnectSeconds)), token);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }

        private async Task ReceiveLoop(ClientWebSocket socket, CancellationToken token)
        {
            byte[] buffer = new byte[8192];
            StringBuilder message = new StringBuilder();

            while (socket.State == WebSocketState.Open && !token.IsCancellationRequested)
            {
                WebSocketReceiveResult result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), token);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    return;
                }

                message.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                if (result.EndOfMessage)
                {
                    incoming.Enqueue(message.ToString());
                    message.Clear();
                }
            }
        }

        private async Task SendLoop(ClientWebSocket socket, CancellationToken token)
        {
            try
            {
                while (socket.State == WebSocketState.Open && !token.IsCancellationRequested)
                {
                    if (outgoing.TryDequeue(out string message))
                    {
                        byte[] bytes = Encoding.UTF8.GetBytes(message);
                        await socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, token);
                    }
                    else
                    {
                        await Task.Delay(50, token);
                    }
                }
            }
            catch (Exception)
            {
                // A queda da conexão é tratada pelo ReceiveLoop/ConnectLoop.
            }
        }
    }
}
