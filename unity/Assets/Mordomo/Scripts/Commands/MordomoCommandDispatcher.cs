using System;
using System.Collections.Generic;
using Mordomo.Avatar;
using UnityEngine;

namespace Mordomo.Commands
{
    /// <summary>
    /// Porteiro dos comandos: só executa ações registradas aqui. Qualquer outra é recusada.
    /// O Unity nunca executa código recebido do Node, apenas escolhe uma destas ações pelo nome.
    /// </summary>
    public class MordomoCommandDispatcher : MonoBehaviour
    {
        public MordomoController controller;

        private delegate bool CommandHandler(MordomoCommand command, out string error);

        private Dictionary<string, CommandHandler> handlers;

        public IEnumerable<string> KnownActions
        {
            get
            {
                EnsureHandlers();
                return handlers.Keys;
            }
        }

        private void EnsureHandlers()
        {
            if (handlers != null)
            {
                return;
            }

            handlers = new Dictionary<string, CommandHandler>(StringComparer.Ordinal)
            {
                { "move_to", (MordomoCommand command, out string error) => controller.MoveTo(command.target, out error) },
                { "speak", (MordomoCommand command, out string error) => controller.Speak(command.text, out error) },
                { "pick_up", (MordomoCommand command, out string error) => controller.PickUp(command.target, out error) },
                { "drop", (MordomoCommand command, out string error) => controller.Drop(command.location, out error) }
                // Próximas ações entram aqui: look_at, follow_user...
            };
        }

        public MordomoCommandResult Dispatch(MordomoCommand command)
        {
            EnsureHandlers();

            if (command == null || string.IsNullOrWhiteSpace(command.action))
            {
                return MordomoCommandResult.Failure(command, "missing_action");
            }

            if (!handlers.TryGetValue(command.action, out CommandHandler handler))
            {
                Debug.LogWarning($"[Mordomo] comando recusado (ação desconhecida): {command.action}");
                return MordomoCommandResult.Failure(command, $"unknown_action:{command.action}");
            }

            if (controller == null)
            {
                return MordomoCommandResult.Failure(command, "controller_missing");
            }

            return handler(command, out string error)
                ? MordomoCommandResult.Success(command)
                : MordomoCommandResult.Failure(command, error);
        }

        /// <summary>Converte o JSON de um comando e o executa. JSON inválido é recusado.</summary>
        public MordomoCommandResult DispatchJson(string json)
        {
            MordomoCommand command;
            try
            {
                command = JsonUtility.FromJson<MordomoCommand>(json);
            }
            catch (ArgumentException)
            {
                return MordomoCommandResult.Failure(null, "invalid_json");
            }

            return Dispatch(command);
        }
    }
}
