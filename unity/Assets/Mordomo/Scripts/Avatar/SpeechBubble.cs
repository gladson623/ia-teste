using System.Text;
using UnityEngine;

namespace Mordomo.Avatar
{
    /// <summary>
    /// Texto flutuante acima da cabeça do Mordomo; acompanha a voz (MordomoVoice) quando ele fala.
    /// </summary>
    public class SpeechBubble : MonoBehaviour
    {
        public TextMesh textMesh;
        public GameObject background;
        public int maxCharsPerLine = 26;

        private float hideAt;

        public bool IsVisible => textMesh != null && textMesh.gameObject.activeSelf;

        private void Start()
        {
            if (hideAt <= 0f)
            {
                SetVisible(false);
            }
        }

        public void Show(string text, float seconds)
        {
            if (textMesh == null)
            {
                return;
            }

            textMesh.text = Wrap(text, maxCharsPerLine);
            hideAt = Time.time + seconds;
            SetVisible(true);
        }

        private void LateUpdate()
        {
            if (!IsVisible)
            {
                return;
            }

            if (Time.time >= hideAt)
            {
                SetVisible(false);
                return;
            }

            // Vira o texto para quem está olhando (a câmera do headset).
            Camera viewer = Camera.main;
            if (viewer != null)
            {
                Vector3 away = transform.position - viewer.transform.position;
                away.y = 0f;
                if (away.sqrMagnitude > 0.0001f)
                {
                    transform.rotation = Quaternion.LookRotation(away);
                }
            }
        }

        private void SetVisible(bool visible)
        {
            if (textMesh != null)
            {
                textMesh.gameObject.SetActive(visible);
            }

            if (background != null)
            {
                background.SetActive(visible);
            }
        }

        public static string Wrap(string text, int maxChars)
        {
            if (string.IsNullOrEmpty(text) || maxChars <= 0)
            {
                return text ?? string.Empty;
            }

            StringBuilder result = new StringBuilder();
            int lineLength = 0;
            foreach (string word in text.Split(' '))
            {
                if (lineLength > 0 && lineLength + 1 + word.Length > maxChars)
                {
                    result.Append('\n');
                    lineLength = 0;
                }
                else if (lineLength > 0)
                {
                    result.Append(' ');
                    lineLength++;
                }

                result.Append(word);
                lineLength += word.Length;
            }

            return result.ToString();
        }
    }
}
