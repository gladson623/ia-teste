using System;
using System.Collections.Generic;
using Mordomo.World;
using UnityEngine;

namespace Mordomo.Avatar
{
    /// <summary>
    /// Comportamento do Mordomo: as ações que o corpo sabe fazer (MoveTo, Speak, PickUp e Drop).
    /// Andar, pegar e soltar entram numa fila e são feitos um de cada vez, na ordem em que chegaram.
    /// </summary>
    [RequireComponent(typeof(MordomoAvatar))]
    public class MordomoController : MonoBehaviour
    {
        public const int MaxQueuedActions = 8;

        public WorldRegistry world;
        public SpeechBubble speechBubble;
        public MordomoVoice voice;

        [Header("Movimento")]
        public float walkSpeed = 1.1f;
        public float turnSpeedDegrees = 360f;
        public float arriveDistance = 0.05f;

        [Header("Fala")]
        public float minSpeakSeconds = 3f;
        public float secondsPerCharacter = 0.07f;

        [Header("Pegar e soltar")]
        [Tooltip("Onde o objeto fica quando o modelo não tem mão (posição relativa ao Mordomo)")]
        public Vector3 holdOffset = new Vector3(0.2f, 1f, 0.3f);
        public float dropDistance = 0.45f;

        private enum ActionKind
        {
            Move,
            PickUp,
            Drop
        }

        private struct BodyAction
        {
            public ActionKind kind;
            // Destino do Move, objeto do PickUp ou lugar do Drop (null = soltar no chão, à frente).
            public WorldObject target;
        }

        private readonly Queue<BodyAction> queue = new Queue<BodyAction>();
        private MordomoAnimator animatorDriver;
        private BodyAction current;
        private bool busy;
        private bool moving;
        private Vector3 destination;
        private Vector3 lookAtAfterArrival;
        private float talkingUntil;
        private WorldObject held;
        // O que estará na mão quando a fila terminar; é com isso que os novos pedidos são validados.
        private string plannedHeldId;

        public bool IsMoving => moving;
        public bool IsBusy => busy || queue.Count > 0;
        public string CurrentTargetId { get; private set; }

        /// <summary>ID do objeto que está na mão, ou null.</summary>
        public string HeldId => held != null ? held.id : null;

        /// <summary>Avisa quando uma ação termina (chegou, pegou ou soltou).</summary>
        public event Action StateChanged;

        private void Awake()
        {
            animatorDriver = GetComponent<MordomoAnimator>();

            // A voz entra sozinha em cenas montadas antes de ela existir.
            if (voice == null)
            {
                voice = GetComponent<MordomoVoice>();
            }

            if (voice == null && Application.isPlaying)
            {
                voice = gameObject.AddComponent<MordomoVoice>();
            }
        }

        /// <summary>Anda até o objeto com esse ID. Devolve false (e o motivo) se o objeto não existir.</summary>
        public bool MoveTo(string targetId, out string error)
        {
            return Find(targetId, out WorldObject target, out error)
                && Enqueue(new BodyAction { kind = ActionKind.Move, target = target }, out error);
        }

        /// <summary>Mostra o texto no balão acima da cabeça e, se houver voz, fala em voz alta.</summary>
        public bool Speak(string text, out string error)
        {
            error = null;
            if (string.IsNullOrWhiteSpace(text))
            {
                error = "empty_text";
                return false;
            }

            float seconds = Mathf.Max(minSpeakSeconds, text.Length * secondsPerCharacter);
            talkingUntil = Time.time + seconds;
            Debug.Log($"[Mordomo] diz: {text}");
            if (speechBubble != null)
            {
                speechBubble.Show(text, seconds);
            }

            if (voice != null)
            {
                // Quando o áudio chega, o balão e a animação de fala passam a durar o tempo real da voz.
                voice.Speak(text, clipSeconds =>
                {
                    talkingUntil = Time.time + clipSeconds;
                    if (speechBubble != null)
                    {
                        speechBubble.Show(text, clipSeconds + 0.5f);
                    }
                });
            }

            return true;
        }

        /// <summary>Vai até o objeto e o pega. Só objetos marcados como interativos, e um de cada vez.</summary>
        public bool PickUp(string objectId, out string error)
        {
            if (!Find(objectId, out WorldObject target, out error))
            {
                return false;
            }

            if (!target.interactive)
            {
                error = $"not_pickable:{target.id}";
                return false;
            }

            if (plannedHeldId != null)
            {
                error = $"already_holding:{plannedHeldId}";
                return false;
            }

            if (!Enqueue(new BodyAction { kind = ActionKind.PickUp, target = target }, out error))
            {
                return false;
            }

            plannedHeldId = target.id;
            return true;
        }

        /// <summary>Solta o que está na mão: em cima do objeto 'locationId' ou, sem ele, no chão à frente.</summary>
        public bool Drop(string locationId, out string error)
        {
            error = null;
            if (plannedHeldId == null)
            {
                error = "not_holding";
                return false;
            }

            WorldObject location = null;
            if (!string.IsNullOrWhiteSpace(locationId))
            {
                if (!Find(locationId, out location, out error))
                {
                    return false;
                }

                if (location.id == plannedHeldId)
                {
                    error = $"invalid_location:{location.id}";
                    return false;
                }
            }

            if (!Enqueue(new BodyAction { kind = ActionKind.Drop, target = location }, out error))
            {
                return false;
            }

            plannedHeldId = null;
            return true;
        }

        /// <summary>Para onde está e esquece o que ainda ia fazer. O que estiver na mão continua na mão.</summary>
        public void Stop()
        {
            queue.Clear();
            busy = false;
            moving = false;
            plannedHeldId = HeldId;
        }

        private bool Find(string id, out WorldObject target, out string error)
        {
            target = null;
            error = null;
            if (world == null)
            {
                error = "world_registry_missing";
                return false;
            }

            if (!world.TryGet(id, out target))
            {
                error = $"unknown_target:{id}";
                return false;
            }

            return true;
        }

        private bool Enqueue(BodyAction action, out string error)
        {
            error = null;
            if (queue.Count >= MaxQueuedActions)
            {
                error = "busy";
                return false;
            }

            queue.Enqueue(action);
            if (!busy)
            {
                StartNext();
            }

            return true;
        }

        private void StartNext()
        {
            while (!busy && queue.Count > 0)
            {
                current = queue.Dequeue();
                busy = true;

                // Sem ter para onde andar (soltar no chão, objeto que sumiu ou que já está na mão), a ação se resolve na hora.
                if (current.target == null || current.target == held)
                {
                    Finish();
                    continue;
                }

                destination = current.target.GetApproachPosition(transform.position);
                lookAtAfterArrival = current.target.LookAtPosition;
                CurrentTargetId = current.target.id;
                moving = true;
            }
        }

        private void Finish()
        {
            moving = false;
            busy = false;

            if (current.kind == ActionKind.PickUp && current.target != null && held == null)
            {
                held = current.target;
                // O objeto sai de onde estava: o ponto de parada antigo não vale mais.
                held.approachPoint = null;
            }
            else if (current.kind == ActionKind.Drop && held != null)
            {
                Place(held, current.target);
                held = null;
            }

            if (animatorDriver != null)
            {
                animatorDriver.SetHolding(held != null);
            }

            if (queue.Count == 0)
            {
                plannedHeldId = HeldId;
            }

            StateChanged?.Invoke();
        }

        private void Place(WorldObject item, WorldObject location)
        {
            Vector3 feet = new Vector3(transform.position.x, 0f, transform.position.z);
            Vector3 spot;
            if (location == null)
            {
                spot = feet + Flat(transform.forward).normalized * dropDistance;
            }
            else if (location.placePoint != null)
            {
                spot = location.placePoint.position;
            }
            else if (location.TryGetBounds(out Bounds surface))
            {
                spot = new Vector3(surface.center.x, surface.max.y, surface.center.z);
            }
            else
            {
                // Lugar sem superfície (ex.: o usuário): no chão, entre o Mordomo e o lugar.
                Vector3 towardsMe = feet - location.LookAtPosition;
                spot = location.LookAtPosition + (towardsMe.sqrMagnitude > 0.0001f ? towardsMe.normalized : Vector3.forward) * dropDistance;
            }

            item.transform.rotation = Quaternion.Euler(0f, transform.eulerAngles.y, 0f);
            float pivotToBottom = item.TryGetBounds(out Bounds itemBounds) ? item.transform.position.y - itemBounds.min.y : 0f;
            item.transform.position = new Vector3(spot.x, spot.y + pivotToBottom, spot.z);
        }

        private static Vector3 Flat(Vector3 vector) => new Vector3(vector.x, 0f, vector.z);

        private void Update()
        {
            float speed = moving ? Step(Time.deltaTime) : 0f;
            if (animatorDriver != null)
            {
                animatorDriver.SetSpeed(speed);
                animatorDriver.SetTalking(Time.time < talkingUntil);
            }
        }

        private void LateUpdate()
        {
            CarryHeld();
        }

        /// <summary>Mantém o objeto segurado na mão (ou à frente do corpo, se o modelo não tiver mão).</summary>
        public void CarryHeld()
        {
            if (held == null)
            {
                return;
            }

            Transform hand = animatorDriver != null ? animatorDriver.HoldingHand : null;
            Vector3 position = hand != null
                ? hand.position + transform.forward * 0.1f + Vector3.up * 0.04f
                : transform.TransformPoint(holdOffset);
            held.transform.SetPositionAndRotation(position, Quaternion.Euler(0f, transform.eulerAngles.y, 0f));
        }

        /// <summary>Avança um passo do movimento. Público para os testes poderem simular o tempo.</summary>
        public float Step(float deltaTime)
        {
            if (!moving)
            {
                return 0f;
            }

            Vector3 position = transform.position;
            Vector3 toDestination = destination - position;
            toDestination.y = 0f;

            if (toDestination.magnitude <= arriveDistance)
            {
                // Chegou: vira para o objeto, conclui a ação e começa a próxima da fila.
                if (Face(lookAtAfterArrival - position, deltaTime))
                {
                    Finish();
                    StartNext();
                }

                return 0f;
            }

            Face(toDestination, deltaTime);
            Vector3 next = Vector3.MoveTowards(position, position + toDestination, walkSpeed * deltaTime);
            transform.position = new Vector3(next.x, position.y, next.z);
            return walkSpeed;
        }

        // Gira em direção a 'direction'; devolve true quando já está alinhado.
        private bool Face(Vector3 direction, float deltaTime)
        {
            direction.y = 0f;
            if (direction.sqrMagnitude < 0.0001f)
            {
                return true;
            }

            Quaternion wanted = Quaternion.LookRotation(direction);
            transform.rotation = Quaternion.RotateTowards(transform.rotation, wanted, turnSpeedDegrees * deltaTime);
            return Quaternion.Angle(transform.rotation, wanted) < 1f;
        }
    }
}
