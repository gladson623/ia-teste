using UnityEngine;

namespace Mordomo.Commands
{
    /// <summary>
    /// Placa na parede que mostra se o corpo está conectado ao cérebro. Ajuda a diagnosticar de dentro do headset.
    /// </summary>
    public class ConnectionStatusDisplay : MonoBehaviour
    {
        public MordomoCommandReceiver receiver;
        public TextMesh textMesh;

        private bool? lastState;

        private void Update()
        {
            if (receiver == null || textMesh == null || lastState == receiver.IsConnected)
            {
                return;
            }

            lastState = receiver.IsConnected;
            textMesh.text = receiver.IsConnected
                ? $"Cérebro: conectado\n{receiver.ActiveUrl}"
                : $"Cérebro: desconectado\n{receiver.ActiveUrl}";
            textMesh.color = receiver.IsConnected ? new Color(0.5f, 1f, 0.6f) : new Color(1f, 0.6f, 0.5f);
        }
    }
}
