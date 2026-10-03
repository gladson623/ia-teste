using UnityEngine;

namespace Mordomo.World
{
    /// <summary>
    /// Marca um objeto da cena com um ID lógico ("table", "chair", "red_box").
    /// O cérebro (Node) só conhece esse ID; quem sabe a posição é o Unity.
    /// </summary>
    public class WorldObject : MonoBehaviour
    {
        [Tooltip("ID lógico usado pelos comandos, ex.: table")]
        public string id;

        [Tooltip("Nome amigável, ex.: Mesa")]
        public string displayName;

        [Tooltip("Ponto onde o Mordomo para ao vir até este objeto. Vazio = para a 'stopDistance' do objeto.")]
        public Transform approachPoint;

        [Tooltip("Distância de parada quando não há approachPoint (metros)")]
        public float stopDistance = 0.8f;

        [Tooltip("Pode ser pego e solto pelo Mordomo (pick_up, drop)")]
        public bool interactive;

        [Tooltip("Onde ficam as coisas colocadas neste objeto (ex.: o tampo da mesa). Vazio = em cima dele.")]
        public Transform placePoint;

        /// <summary>Para onde o Mordomo deve andar, vindo de 'from', sempre no nível do chão.</summary>
        public Vector3 GetApproachPosition(Vector3 from)
        {
            if (approachPoint != null)
            {
                return Flat(approachPoint.position);
            }

            Vector3 target = Flat(transform.position);
            Vector3 direction = Flat(from) - target;
            if (direction.sqrMagnitude < 0.0001f)
            {
                return target;
            }

            return target + direction.normalized * stopDistance;
        }

        public Vector3 LookAtPosition => Flat(transform.position);

        /// <summary>Volume ocupado pelas partes visíveis deste objeto, sem contar outros objetos com ID que estejam dentro dele.</summary>
        public bool TryGetBounds(out Bounds bounds)
        {
            bounds = default;
            bool found = false;
            foreach (Renderer part in GetComponentsInChildren<Renderer>())
            {
                if (part.GetComponentInParent<WorldObject>() != this)
                {
                    continue;
                }

                if (found)
                {
                    bounds.Encapsulate(part.bounds);
                }
                else
                {
                    bounds = part.bounds;
                    found = true;
                }
            }

            return found;
        }

        private static Vector3 Flat(Vector3 position) => new Vector3(position.x, 0f, position.z);
    }
}
