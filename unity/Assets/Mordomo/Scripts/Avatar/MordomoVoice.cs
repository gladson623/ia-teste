using System;
using System.Collections.Concurrent;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Mordomo.Commands;
using UnityEngine;

namespace Mordomo.Avatar
{
    /// <summary>
    /// Voz do Mordomo: pede ao cérebro (POST /api/tts, Kokoro) o áudio de um texto e toca no AudioSource do avatar.
    /// Se o cérebro ou o serviço de voz não responder, o Mordomo só mostra o balão de texto.
    /// </summary>
    [RequireComponent(typeof(AudioSource))]
    public class MordomoVoice : MonoBehaviour
    {
        [Tooltip("Vazio = usa o mesmo endereço do MordomoCommandReceiver. Ex.: http://192.168.1.4:3010")]
        public string serverUrlOverride = "";

        public float timeoutSeconds = 30f;

        // Mesma pilha de rede do WebSocket (.NET), que funciona com http:// na rede local.
        private static readonly HttpClient Http = new HttpClient();

        private readonly ConcurrentQueue<Download> downloads = new ConcurrentQueue<Download>();
        private AudioSource source;
        private MordomoCommandReceiver brain;
        private Action<float> onClipReady;
        private int latestRequest;

        private struct Download
        {
            public int request;
            public byte[] wav;
            public string error;
        }

        [Serializable]
        private class TtsRequest
        {
            public string text;
        }

        private void Awake()
        {
            source = GetComponent<AudioSource>();
            source.playOnAwake = false;
            // Som 3D: a voz sai de onde o Mordomo está.
            source.spatialBlend = 1f;
            source.minDistance = 1f;
            source.maxDistance = 15f;
        }

        private readonly float[] loudnessWindow = new float[256];

        /// <summary>Volume da voz neste instante (0 quando não está tocando); usado para mexer a boca do avatar.</summary>
        public float Loudness
        {
            get
            {
                if (source == null || !source.isPlaying)
                {
                    return 0f;
                }

                source.GetOutputData(loudnessWindow, 0);
                float sum = 0f;
                for (int i = 0; i < loudnessWindow.Length; i++)
                {
                    sum += loudnessWindow[i] * loudnessWindow[i];
                }

                return Mathf.Sqrt(sum / loudnessWindow.Length);
            }
        }

        /// <summary>Fala o texto. 'clipReady' recebe a duração do áudio (segundos) quando ele começa a tocar.</summary>
        public void Speak(string text, Action<float> clipReady = null)
        {
            string baseUrl = ResolveBaseUrl();
            if (string.IsNullOrEmpty(baseUrl))
            {
                return;
            }

            int request = ++latestRequest;
            onClipReady = clipReady;
            string url = baseUrl + "/api/tts";
            string body = JsonUtility.ToJson(new TtsRequest { text = text });
            TimeSpan timeout = TimeSpan.FromSeconds(Mathf.Max(1f, timeoutSeconds));

            // O download roda fora da thread principal; o áudio é montado e tocado no Update.
            Task.Run(async () =>
            {
                try
                {
                    downloads.Enqueue(new Download { request = request, wav = await Fetch(url, body, timeout) });
                }
                catch (Exception error)
                {
                    downloads.Enqueue(new Download { request = request, error = error.Message });
                }
            });
        }

        private static async Task<byte[]> Fetch(string url, string body, TimeSpan timeout)
        {
            using (var cancel = new System.Threading.CancellationTokenSource(timeout))
            using (var content = new StringContent(body, Encoding.UTF8, "application/json"))
            using (HttpResponseMessage response = await Http.PostAsync(url, content, cancel.Token))
            {
                if (!response.IsSuccessStatusCode)
                {
                    throw new Exception($"HTTP {(int)response.StatusCode}");
                }

                return await response.Content.ReadAsByteArrayAsync();
            }
        }

        private void Update()
        {
            while (downloads.TryDequeue(out Download download))
            {
                // Uma fala mais nova substitui as que ainda estavam baixando.
                if (download.request != latestRequest)
                {
                    continue;
                }

                if (download.error != null)
                {
                    Debug.LogWarning($"[Mordomo] voz indisponível: {download.error}");
                    continue;
                }

                Play(download.wav);
            }
        }

        private void Play(byte[] wav)
        {
            if (!TryDecodeWav(wav, out float[] samples, out int channels, out int sampleRate))
            {
                Debug.LogWarning("[Mordomo] voz indisponível: áudio em formato inesperado");
                return;
            }

            AudioClip previous = source.clip;
            AudioClip clip = AudioClip.Create("MordomoVoice", samples.Length / channels, channels, sampleRate, false);
            clip.SetData(samples, 0);
            source.Stop();
            source.clip = clip;
            source.Play();
            if (previous != null)
            {
                Destroy(previous);
            }

            onClipReady?.Invoke(clip.length);
        }

        private string ResolveBaseUrl()
        {
            if (!string.IsNullOrWhiteSpace(serverUrlOverride))
            {
                return serverUrlOverride.TrimEnd('/');
            }

            if (brain == null)
            {
                brain = FindAnyObjectByType<MordomoCommandReceiver>();
            }

            return brain != null ? HttpBaseFromWebSocketUrl(brain.ActiveUrl) : null;
        }

        /// <summary>"ws://192.168.1.4:3010/ws" vira "http://192.168.1.4:3010". Devolve null se o endereço for inválido.</summary>
        public static string HttpBaseFromWebSocketUrl(string webSocketUrl)
        {
            if (!Uri.TryCreate(webSocketUrl, UriKind.Absolute, out Uri uri) || (uri.Scheme != "ws" && uri.Scheme != "wss"))
            {
                return null;
            }

            return $"{(uri.Scheme == "wss" ? "https" : "http")}://{uri.Authority}";
        }

        /// <summary>Lê um WAV PCM de 16 bits (o formato que o cérebro devolve) para amostras entre -1 e 1.</summary>
        public static bool TryDecodeWav(byte[] wav, out float[] samples, out int channels, out int sampleRate)
        {
            samples = null;
            channels = 0;
            sampleRate = 0;
            if (wav == null || wav.Length < 12 || Tag(wav, 0) != "RIFF" || Tag(wav, 8) != "WAVE")
            {
                return false;
            }

            int bitsPerSample = 0;
            int format = 0;
            int offset = 12;
            while (offset + 8 <= wav.Length)
            {
                string chunk = Tag(wav, offset);
                int size = BitConverter.ToInt32(wav, offset + 4);
                int start = offset + 8;
                if (size < 0 || start + size > wav.Length)
                {
                    return false;
                }

                if (chunk == "fmt " && size >= 16)
                {
                    format = BitConverter.ToInt16(wav, start);
                    channels = BitConverter.ToInt16(wav, start + 2);
                    sampleRate = BitConverter.ToInt32(wav, start + 4);
                    bitsPerSample = BitConverter.ToInt16(wav, start + 14);
                }
                else if (chunk == "data")
                {
                    if (format != 1 || bitsPerSample != 16 || channels < 1 || sampleRate < 1 || size < 2 * channels)
                    {
                        return false;
                    }

                    samples = new float[size / 2];
                    for (int i = 0; i < samples.Length; i++)
                    {
                        samples[i] = BitConverter.ToInt16(wav, start + i * 2) / 32768f;
                    }

                    return true;
                }

                // Os blocos do WAV são alinhados em 2 bytes.
                offset = start + size + (size & 1);
            }

            return false;
        }

        private static string Tag(byte[] bytes, int offset) => Encoding.ASCII.GetString(bytes, offset, 4);
    }
}
