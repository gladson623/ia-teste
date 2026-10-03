using UniVRM10;
using UnityEngine;

namespace Mordomo.Avatar
{
    /// <summary>
    /// Dá vida a um modelo anime (VRM, esqueleto humanoide) sem precisar de animações prontas:
    /// tira o modelo da pose em T, faz respirar, andar, virar a cabeça para quem olha, piscar e mexer a boca ao falar.
    /// Fica na raiz do modelo, dentro de Mordomo/Visual.
    /// </summary>
    public class AnimeAvatar : MonoBehaviour
    {
        [Header("Pose parada")]
        public float armDownDegrees = 74f;
        public float elbowBendDegrees = 14f;
        public float breathDegrees = 1.4f;
        public float breathFrequency = 1.5f;

        [Header("Segurando um objeto")]
        public float holdArmDownDegrees = 80f;
        public float holdElbowDegrees = 88f;

        [Header("Andar")]
        public float stepFrequency = 7.5f;
        public float legSwingDegrees = 26f;
        public float kneeBendDegrees = 38f;
        public float armSwingDegrees = 18f;
        public float walkBobHeight = 0.018f;

        [Header("Olhar")]
        public float maxHeadYaw = 55f;
        public float maxHeadPitch = 22f;
        public float headTurnSpeed = 5f;

        [Header("Rosto")]
        public float blinkMinSeconds = 2f;
        public float blinkMaxSeconds = 5.5f;
        public float blinkSeconds = 0.13f;
        public float mouthGain = 9f;

        // Ossos animados e a rotação de cada um na pose em T (gravadas ao montar a cena, antes de qualquer pose).
        [SerializeField] private Transform[] bones;
        [SerializeField] private Quaternion[] restLocal;
        [SerializeField] private Quaternion[] restModel;
        [SerializeField] private Vector3 hipsRestPosition;

        private static readonly HumanBodyBones[] Animated =
        {
            HumanBodyBones.Hips, HumanBodyBones.Spine, HumanBodyBones.Chest, HumanBodyBones.Neck, HumanBodyBones.Head,
            HumanBodyBones.LeftUpperArm, HumanBodyBones.LeftLowerArm, HumanBodyBones.RightUpperArm, HumanBodyBones.RightLowerArm,
            HumanBodyBones.LeftUpperLeg, HumanBodyBones.LeftLowerLeg, HumanBodyBones.RightUpperLeg, HumanBodyBones.RightLowerLeg
        };

        private const int Hips = 0, Spine = 1, Chest = 2, Neck = 3, Head = 4;
        private const int LeftUpperArm = 5, LeftLowerArm = 6, RightUpperArm = 7, RightLowerArm = 8;
        private const int LeftUpperLeg = 9, LeftLowerLeg = 10, RightUpperLeg = 11, RightLowerLeg = 12;

        private Vrm10Instance vrm;
        private float walkPhase;
        private float walkBlend;
        private float headYaw;
        private float headPitch;
        private float nextBlinkAt;
        private float blinkStartedAt = -10f;
        private float mouth;
        private float holdBlend;
        private Transform rightHand;

        /// <summary>Velocidade de caminhada (m/s); 0 = parado.</summary>
        public float Speed { get; set; }

        public bool Talking { get; set; }

        /// <summary>Volume da voz neste instante (0 a 1); com a voz tocando, a boca acompanha o som.</summary>
        public float Loudness { get; set; }

        /// <summary>Com um objeto na mão: o antebraço direito fica dobrado para a frente.</summary>
        public bool Holding { get; set; }

        /// <summary>Mão direita do modelo (onde fica o objeto segurado); null se o modelo não tiver.</summary>
        public Transform RightHand
        {
            get
            {
                if (rightHand == null)
                {
                    Animator animator = GetComponent<Animator>();
                    rightHand = animator != null && animator.isHuman ? animator.GetBoneTransform(HumanBodyBones.RightHand) : null;
                }

                return rightHand;
            }
        }

        public bool IsBound => bones != null && bones.Length == Animated.Length;

        /// <summary>Altura da cabeça em relação aos pés, para posicionar o balão de fala.</summary>
        public float HeadHeight => IsBound && bones[Head] != null ? bones[Head].position.y - transform.position.y : 1.4f;

        /// <summary>Guarda a pose em T do esqueleto. Deve rodar com o modelo ainda na pose original.</summary>
        public bool Bind()
        {
            Animator animator = GetComponent<Animator>();
            if (animator == null || !animator.isHuman)
            {
                return false;
            }

            bones = new Transform[Animated.Length];
            restLocal = new Quaternion[Animated.Length];
            restModel = new Quaternion[Animated.Length];
            Quaternion toModel = Quaternion.Inverse(transform.rotation);
            for (int i = 0; i < Animated.Length; i++)
            {
                Transform bone = animator.GetBoneTransform(Animated[i]);
                bones[i] = bone;
                if (bone != null)
                {
                    restLocal[i] = bone.localRotation;
                    restModel[i] = toModel * bone.rotation;
                }
            }

            if (bones[Hips] != null)
            {
                hipsRestPosition = bones[Hips].localPosition;
            }

            return bones[Hips] != null;
        }

        private void Awake()
        {
            if (!IsBound)
            {
                Bind();
            }

            PrepareRuntime();
            nextBlinkAt = Time.time + Random.Range(blinkMinSeconds, blinkMaxSeconds);
        }

        /// <summary>
        /// Cria o runtime do VRM com o modelo ainda na pose em T, para ele calibrar mangas, cabelo e olhos corretamente.
        /// Tem de rodar antes da primeira pose.
        /// </summary>
        public Vrm10Runtime PrepareRuntime()
        {
            if (vrm == null)
            {
                vrm = GetComponent<Vrm10Instance>();
            }

            return vrm != null ? vrm.Runtime : null;
        }

        private void Start()
        {
            // Os olhos seguem a câmera de quem está na sala.
            if (vrm != null && Camera.main != null)
            {
                vrm.LookAtTargetType = VRM10ObjectLookAt.LookAtTargetTypes.SpecifiedTransform;
                vrm.LookAtTarget = Camera.main.transform;
            }
        }

        // Roda antes do Vrm10Instance (ordem 11000), que aplica olhos, expressões e a física do cabelo sobre esta pose.
        private void LateUpdate()
        {
            if (!IsBound)
            {
                return;
            }

            float deltaTime = Time.deltaTime;
            bool walking = Speed > 0.05f;
            walkBlend = Mathf.MoveTowards(walkBlend, walking ? 1f : 0f, deltaTime * 5f);
            if (walkBlend > 0f)
            {
                walkPhase += deltaTime * stepFrequency;
            }

            holdBlend = Mathf.MoveTowards(holdBlend, Holding ? 1f : 0f, deltaTime * 4f);
            UpdateHeadTarget(deltaTime);
            ApplyPose(Time.time);
            UpdateFace(deltaTime);
        }

        /// <summary>Aplica uma pose escolhida (fase do passo e quanto está andando, de 0 a 1). Usado pelas fotos de prévia.</summary>
        public void ApplyPose(float time, float stepPhase, float walking)
        {
            walkPhase = stepPhase;
            walkBlend = Mathf.Clamp01(walking);
            ApplyPose(time);
        }

        /// <summary>Aplica a pose do instante informado.</summary>
        public void ApplyPose(float time)
        {
            if (!IsBound)
            {
                return;
            }

            float breath = Mathf.Sin(time * breathFrequency);
            float step = Mathf.Sin(walkPhase) * walkBlend;
            float talkNod = Talking ? Mathf.Sin(time * 5f) * 1.5f : 0f;

            // Eixos no espaço do modelo, pose em T: X = direita do modelo, Y = cima, Z = frente.
            Set(Hips, Quaternion.Euler(0f, step * 4f, 0f));
            Set(Spine, Quaternion.Euler(breath * breathDegrees * 0.5f, -step * 3f, 0f));
            Set(Chest, Quaternion.Euler(breath * breathDegrees, -step * 3f, 0f));
            Set(Neck, Quaternion.Euler(headPitch * 0.4f, headYaw * 0.4f, 0f));
            Set(Head, Quaternion.Euler(headPitch * 0.6f + talkNod, headYaw * 0.6f, 0f));

            // Braços: primeiro descem ao lado do corpo, depois balançam para frente e para trás ao andar.
            float armSwing = step * armSwingDegrees;
            Set(LeftUpperArm, Quaternion.AngleAxis(armSwing, Vector3.right) * Quaternion.AngleAxis(armDownDegrees + breath * 0.6f, Vector3.forward));
            // Segurando algo, o braço direito para de balançar e o antebraço aponta para a frente.
            float rightArmDown = Mathf.Lerp(armDownDegrees, holdArmDownDegrees, holdBlend) + breath * 0.6f;
            float rightElbow = Mathf.Lerp(elbowBendDegrees + Mathf.Max(0f, step) * 14f, holdElbowDegrees, holdBlend);
            Set(RightUpperArm, Quaternion.AngleAxis(-armSwing * (1f - holdBlend), Vector3.right) * Quaternion.AngleAxis(-rightArmDown, Vector3.forward));
            Set(LeftLowerArm, Quaternion.AngleAxis(elbowBendDegrees + Mathf.Max(0f, -step) * 14f, Vector3.up));
            Set(RightLowerArm, Quaternion.AngleAxis(-rightElbow, Vector3.up));

            // Pernas: a coxa balança e o joelho dobra enquanto a perna vem para a frente.
            float leftLeg = step * legSwingDegrees;
            Set(LeftUpperLeg, Quaternion.AngleAxis(-leftLeg, Vector3.right));
            Set(RightUpperLeg, Quaternion.AngleAxis(leftLeg, Vector3.right));
            Set(LeftLowerLeg, Quaternion.AngleAxis(Mathf.Max(0f, Mathf.Cos(walkPhase)) * walkBlend * kneeBendDegrees, Vector3.right));
            Set(RightLowerLeg, Quaternion.AngleAxis(Mathf.Max(0f, -Mathf.Cos(walkPhase)) * walkBlend * kneeBendDegrees, Vector3.right));

            float bob = Mathf.Abs(Mathf.Sin(walkPhase)) * walkBobHeight * walkBlend;
            bones[Hips].localPosition = hipsRestPosition + new Vector3(0f, bob / Mathf.Max(0.0001f, bones[Hips].parent != null ? bones[Hips].parent.lossyScale.y : 1f), 0f);
        }

        // 'offset' é a rotação desejada no espaço do modelo em relação à pose em T; os pais se acumulam pela hierarquia.
        private void Set(int index, Quaternion offset)
        {
            Transform bone = bones[index];
            if (bone != null)
            {
                bone.localRotation = restLocal[index] * Quaternion.Inverse(restModel[index]) * offset * restModel[index];
            }
        }

        private void UpdateHeadTarget(float deltaTime)
        {
            float wantedYaw = 0f;
            float wantedPitch = 0f;
            Camera viewer = Camera.main;
            if (viewer != null && bones[Head] != null && walkBlend < 0.5f)
            {
                Vector3 toViewer = transform.InverseTransformDirection(viewer.transform.position - bones[Head].position);
                if (toViewer.sqrMagnitude > 0.01f)
                {
                    wantedYaw = Mathf.Clamp(Mathf.Atan2(toViewer.x, toViewer.z) * Mathf.Rad2Deg, -maxHeadYaw, maxHeadYaw);
                    float flat = new Vector2(toViewer.x, toViewer.z).magnitude;
                    wantedPitch = Mathf.Clamp(-Mathf.Atan2(toViewer.y, flat) * Mathf.Rad2Deg, -maxHeadPitch, maxHeadPitch);
                }
            }

            float blend = 1f - Mathf.Exp(-headTurnSpeed * deltaTime);
            headYaw = Mathf.Lerp(headYaw, wantedYaw, blend);
            headPitch = Mathf.Lerp(headPitch, wantedPitch, blend);
        }

        private void UpdateFace(float deltaTime)
        {
            if (vrm == null)
            {
                return;
            }

            if (Time.time >= nextBlinkAt)
            {
                blinkStartedAt = Time.time;
                nextBlinkAt = Time.time + Random.Range(blinkMinSeconds, blinkMaxSeconds);
            }

            float blinkProgress = (Time.time - blinkStartedAt) / blinkSeconds;
            float blink = blinkProgress < 1f ? Mathf.Sin(blinkProgress * Mathf.PI) : 0f;

            // Com áudio, a boca segue o volume; sem áudio (voz indisponível), abre e fecha num ritmo de fala.
            float wantedMouth = 0f;
            if (Talking)
            {
                wantedMouth = Loudness > 0.001f
                    ? Mathf.Clamp01(Loudness * mouthGain)
                    : 0.25f + 0.35f * Mathf.Abs(Mathf.Sin(Time.time * 9f));
            }

            mouth = Mathf.Lerp(mouth, wantedMouth, 1f - Mathf.Exp(-18f * deltaTime));

            Vrm10RuntimeExpression expression = vrm.Runtime.Expression;
            expression.SetWeight(ExpressionKey.Blink, blink);
            expression.SetWeight(ExpressionKey.Aa, mouth);
            expression.SetWeight(ExpressionKey.Relaxed, Talking ? 0f : 0.25f);
        }
    }
}
