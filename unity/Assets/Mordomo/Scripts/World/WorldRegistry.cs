using System.Collections.Generic;
using UnityEngine;

namespace Mordomo.World
{
    /// <summary>
    /// Catálogo dos WorldObject da cena, por ID. É aqui que "table" vira um objeto de verdade.
    /// </summary>
    public class WorldRegistry : MonoBehaviour
    {
        private readonly Dictionary<string, WorldObject> objects = new Dictionary<string, WorldObject>();
        private bool scanned;

        public IEnumerable<WorldObject> Objects
        {
            get
            {
                EnsureScanned();
                return objects.Values;
            }
        }

        public bool TryGet(string id, out WorldObject worldObject)
        {
            EnsureScanned();
            worldObject = null;
            return !string.IsNullOrWhiteSpace(id) && objects.TryGetValue(Normalize(id), out worldObject) && worldObject != null;
        }

        /// <summary>Procura de novo todos os WorldObject da cena (use após criar ou remover objetos).</summary>
        public void Rescan()
        {
            objects.Clear();
            foreach (WorldObject worldObject in FindObjectsByType<WorldObject>(FindObjectsInactive.Exclude))
            {
                if (string.IsNullOrWhiteSpace(worldObject.id))
                {
                    continue;
                }

                string key = Normalize(worldObject.id);
                if (objects.ContainsKey(key))
                {
                    Debug.LogWarning($"[Mordomo] ID de objeto duplicado: {key}", worldObject);
                    continue;
                }

                objects[key] = worldObject;
            }

            scanned = true;
        }

        private void EnsureScanned()
        {
            if (!scanned)
            {
                Rescan();
            }
        }

        private static string Normalize(string id) => id.Trim().ToLowerInvariant();
    }
}
