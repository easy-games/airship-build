import { ChatCommand } from "@Easy/Core/Shared/Commands/ChatCommand";
import { Player } from "@Easy/Core/Shared/Player/Player";
import { ChatColor } from "@Easy/Core/Shared/Util/ChatColor";
import WorldManager from "Code/World/WorldManager";

export default class SaveCommand extends ChatCommand {
	constructor() {
		super("save", undefined, undefined, "Saves the world.", true);
	}

	public async Execute(player: Player, args: string[]): Promise<void> {
		const world = WorldManager.Get().GetLoadedWorldOwnedByPlayer(player);
		if (world) {
			player.SendMessage("Saving world...");
			try {
				await world.SaveAsync();
				player.SendMessage(ChatColor.Green("World saved!"));
			} catch (err) {
				Debug.LogError(err);
				player.SendMessage(ChatColor.Red("Failed to save world."));
			}
		}
	}
}
