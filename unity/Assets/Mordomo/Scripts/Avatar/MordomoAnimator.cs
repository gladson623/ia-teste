using UnityEngine;

namespace Mordomo.Avatar
{
    /// <summary>
    /// Animações do Mordomo. Repassa "andando" e "falando" para o que o modelo tiver:
    /// um AnimeAvatar (modelo anime, animado por código), um Animator com os parâmetros "Speed" e "Talking",
    /// ou, no boneco provisório, um balanço simples feito aqui mesmo.
    /// </summary>
    [RequireComponent(typeof(MordomoAvatar))]
    public class MordomoAnimator : MonoBehaviour
    {
        private static readonly int SpeedParameter = Animator.StringToHash("Speed");
        private static readonly int TalkingParameter = Animator.StringToHash("Talking");

        [Header("Animação por código (boneco provisório)")]
        public float walkBobHeight = 0.035f;
        public float walkBobFrequency = 9f;
        public float walkSwayDegrees = 3f;
        public float idleBreathHeight = 0.008f;
        public float idleBreathFrequency = 1.6f;

        private MordomoAvatar avatar;
        private MordomoVoice voice;
        private AnimeAvatar anime;
        private float speed;
        private bool talking;
        private bool holding;
        private float phase;

        private void Awake()
        {
            avatar = GetComponent<MordomoAvatar>();
        }

        public void SetSpeed(float metersPerSecond)
        {
            speed = Mathf.Max(0f, metersPerSecond);
        }

        public void SetTalking(bool isTalking)
        {
            talking = isTalking;
        }

        public void SetHolding(bool isHolding)
        {
            holding = isHolding;
        }

        /// <summary>Mão que segura objetos, quando o modelo tem uma; senão null.</summary>
        public Transform HoldingHand
        {
            get
            {
                if (anime == null && avatar != null && avatar.visualRoot != null)
                {
                    anime = avatar.visualRoot.GetComponentInChildren<AnimeAvatar>();
                }

                return anime != null ? anime.RightHand : null;
            }
        }

        private void Update()
        {
            if (avatar == null || avatar.visualRoot == null)
            {
                return;
            }

            if (anime == null)
            {
                anime = avatar.visualRoot.GetComponentInChildren<AnimeAvatar>();
            }

            if (anime != null)
            {
                if (voice == null)
                {
                    voice = GetComponent<MordomoVoice>();
                }

                anime.Speed = speed;
                anime.Talking = talking;
                anime.Holding = holding;
                anime.Loudness = voice != null ? voice.Loudness : 0f;
                return;
            }

            Animator modelAnimator = avatar.ModelAnimator;
            if (modelAnimator != null && modelAnimator.runtimeAnimatorController != null)
            {
                modelAnimator.SetFloat(SpeedParameter, speed);
                modelAnimator.SetBool(TalkingParameter, talking);
                return;
            }

            bool walking = speed > 0.05f;
            phase += Time.deltaTime * (walking ? walkBobFrequency : idleBreathFrequency);

            float height = walking
                ? Mathf.Abs(Mathf.Sin(phase)) * walkBobHeight
                : Mathf.Sin(phase) * idleBreathHeight;
            float sway = walking ? Mathf.Sin(phase) * walkSwayDegrees : 0f;
            float nod = talking ? Mathf.Sin(Time.time * 6f) * 2f : 0f;

            avatar.visualRoot.localPosition = new Vector3(0f, height, 0f);
            avatar.visualRoot.localRotation = Quaternion.Euler(nod, 0f, sway);
        }
    }
}
