using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.XR;

namespace Mordomo.XRSupport
{
    /// <summary>
    /// Só para testar no PC sem headset: se não houver óculos ativo, sobe a câmera para a altura dos olhos,
    /// deixa andar com WASD (ou setas) e olhar ao redor segurando o botão direito do mouse.
    /// No Quest este script não faz nada.
    /// </summary>
    public class DesktopCameraFallback : MonoBehaviour
    {
        public Transform cameraOffset;
        public Transform cameraTransform;
        public float eyeHeight = 1.6f;
        public float lookSensitivity = 0.15f;
        public float walkSpeed = 2f;
        public float runMultiplier = 2f;

        [Tooltip("Metade do lado da sala em que dá para andar, a partir do centro")]
        public float roomHalfSize = 2.7f;

        public float hintSeconds = 12f;

        private float yaw;
        private float pitch;
        private bool applied;

        private void Update()
        {
            if (XRSettings.isDeviceActive)
            {
                return;
            }

            if (!applied && cameraOffset != null)
            {
                cameraOffset.localPosition = new Vector3(0f, eyeHeight, 0f);
                applied = true;
            }

            if (cameraTransform == null)
            {
                return;
            }

            Look();
            Walk();
        }

        private void Look()
        {
            Mouse mouse = Mouse.current;
            if (mouse == null || !mouse.rightButton.isPressed)
            {
                return;
            }

            Vector2 delta = mouse.delta.ReadValue();
            yaw += delta.x * lookSensitivity;
            pitch = Mathf.Clamp(pitch - delta.y * lookSensitivity, -80f, 80f);
            cameraTransform.localRotation = Quaternion.Euler(pitch, yaw, 0f);
        }

        private void Walk()
        {
            Keyboard keyboard = Keyboard.current;
            if (keyboard == null)
            {
                return;
            }

            float forward = Axis(keyboard.wKey.isPressed || keyboard.upArrowKey.isPressed, keyboard.sKey.isPressed || keyboard.downArrowKey.isPressed);
            float right = Axis(keyboard.dKey.isPressed || keyboard.rightArrowKey.isPressed, keyboard.aKey.isPressed || keyboard.leftArrowKey.isPressed);
            if (forward == 0f && right == 0f)
            {
                return;
            }

            // Anda na direção para onde a câmera aponta, sem subir nem descer.
            Vector3 ahead = cameraTransform.forward;
            ahead.y = 0f;
            Vector3 side = cameraTransform.right;
            side.y = 0f;
            Vector3 direction = (ahead.normalized * forward + side.normalized * right).normalized;
            float speed = walkSpeed * (keyboard.shiftKey.isPressed ? runMultiplier : 1f);

            Vector3 position = transform.position + direction * (speed * Time.deltaTime);
            position.x = Mathf.Clamp(position.x, -roomHalfSize, roomHalfSize);
            position.z = Mathf.Clamp(position.z, -roomHalfSize, roomHalfSize);
            transform.position = position;
        }

        private static float Axis(bool positive, bool negative)
        {
            return (positive ? 1f : 0f) - (negative ? 1f : 0f);
        }

        private void OnGUI()
        {
            if (XRSettings.isDeviceActive || Time.timeSinceLevelLoad > hintSeconds)
            {
                return;
            }

            GUI.Label(new Rect(12f, 10f, 700f, 24f), "WASD ou setas: andar  |  Shift: correr  |  segure o botão direito do mouse: olhar");
        }
    }
}
