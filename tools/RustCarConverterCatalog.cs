// SPDX-License-Identifier: MIT
using System;
using System.Collections.Generic;
using Oxide.Core;

namespace Oxide.Plugins
{
    [Info("RustCar Converter Catalog", "niposch", "0.1.0")]
    [Description("Exports entity prefab paths for the RustEdit RustCar converter.")]
    public class RustCarConverterCatalog : RustPlugin
    {
        [ConsoleCommand("rustcarconverter.catalog")]
        private void ExportCatalog(ConsoleSystem.Arg arg)
        {
            if (arg.Connection != null || arg.Player() != null)
            {
                arg.ReplyWith("Run this command in the server console.");
                return;
            }

            if (GameManifest.Current == null || GameManifest.Current.entities == null)
            {
                Puts("Wait until the server has initialized, then run the command again.");
                return;
            }

            var entities = new SortedSet<string>(StringComparer.Ordinal);
            foreach (var path in GameManifest.Current.entities)
            {
                if (string.IsNullOrEmpty(path) || !path.StartsWith("assets/", StringComparison.Ordinal)
                    || !path.EndsWith(".prefab", StringComparison.Ordinal))
                    continue;

                var prefab = GameManager.server.FindPrefab(path);
                if (prefab != null && prefab.GetComponent<BaseEntity>() != null)
                    entities.Add(path);
            }

            if (entities.Count == 0)
            {
                Puts("No entity prefabs found. No catalog was written.");
                return;
            }

            Interface.Oxide.DataFileSystem.WriteObject("RustCarConverter/prefabs", new
            {
                format = "rustcar-prefab-catalog",
                version = 1,
                entities
            });
            Puts($"Wrote {entities.Count} entity paths to {Interface.Oxide.DataDirectory}/RustCarConverter/prefabs.json");
        }
    }
}
