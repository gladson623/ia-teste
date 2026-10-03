using System;

namespace Mordomo.Commands
{
    /// <summary>
    /// Um comando vindo do cérebro, ex.: {"action":"move_to","target":"table"}, {"action":"speak","text":"Olá!"},
    /// {"action":"pick_up","target":"red_box"} ou {"action":"drop","location":"shelf"}.
    /// </summary>
    [Serializable]
    public class MordomoCommand
    {
        public string id;
        public string action;
        public string target;
        public string text;
        public string location;
    }

    /// <summary>Resposta devolvida ao cérebro depois de tratar um comando.</summary>
    [Serializable]
    public class MordomoCommandResult
    {
        public string id;
        public string action;
        public bool ok;
        public string error;

        public static MordomoCommandResult Success(MordomoCommand command) =>
            new MordomoCommandResult { id = command.id, action = command.action, ok = true, error = string.Empty };

        public static MordomoCommandResult Failure(MordomoCommand command, string error) =>
            new MordomoCommandResult { id = command?.id, action = command?.action, ok = false, error = error };
    }
}
