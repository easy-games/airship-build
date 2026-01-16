import { ChatCommand } from "@Easy/Core/Shared/Commands/ChatCommand";
import { Player } from "@Easy/Core/Shared/Player/Player";
import { ChatColor } from "@Easy/Core/Shared/Util/ChatColor";
import WorldManager from "Code/World/WorldManager";

export default class WorldsCommand extends ChatCommand {
	constructor() {
		super("worlds", undefined, undefined, "List loaded worlds.", true);
	}

	public async Execute(player: Player, args: string[]): Promise<void> {
		player.SendMessage("Worlds (Player, WorldID):");
		let i = 1;
		for (const world of WorldManager.Get().loadedWorlds) {
			player.SendMessage(
				`  ${i}. ${world.GetOwnerPlayer()?.username ?? "Unknown"} ${world.worldId}. Perms: ${
					world.HasBuildPermission(player) || world.IsOwner(player) ? ChatColor.Yellow("Yes") : "No"
				}`,
			);
			i++;
		}
	}
}
