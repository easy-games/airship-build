import { ChatCommand } from "@Easy/Core/Shared/Commands/ChatCommand";
import { Player } from "@Easy/Core/Shared/Player/Player";
import { ChatColor } from "@Easy/Core/Shared/Util/ChatColor";
import WorldManager from "Code/World/WorldManager";

export abstract class EditBaseCommand extends ChatCommand {
	protected ValidateWorldPermission(player: Player): boolean {
		const world = WorldManager.Get().GetCurrentLoadedWorldFromPlayer(player);
		if (!world) return false;
		if (!world.HasBuildPermission(player)) {
			player.SendMessage(ChatColor.Red("No build permission."));
			return false;
		}
		return true;
	}
}
