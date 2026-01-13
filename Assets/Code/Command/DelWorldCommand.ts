import { Platform } from "@Easy/Core/Shared/Airship";
import { ChatCommand } from "@Easy/Core/Shared/Commands/ChatCommand";
import { Player } from "@Easy/Core/Shared/Player/Player";
import { ChatColor } from "@Easy/Core/Shared/Util/ChatColor";
import ProfileManager from "Code/ProfileManager/ProfileManager";
import WorldManager from "Code/World/WorldManager";

export default class DelWorldCommand extends ChatCommand {
	constructor() {
		super("delworld", undefined, undefined, "Deletes your world.", false);
	}

	public async Execute(player: Player, args: string[]): Promise<void> {
		const world = WorldManager.Get().GetLoadedWorldFromPlayer(player);
		if (!world) return;
		if (!world.IsOwner(player)) {
			player.SendMessage(ChatColor.Red("You are not the owner of this world."));
			return;
		}

		player.SendMessage("Deleting world...");
		try {
			await Platform.Server.DataStore.DeleteKey(`World:${world.worldProfile!.id}`);
			await WorldManager.Get().UnloadWorld(world, false);

			const profile = ProfileManager.Get().WaitForProfile(player);
			const idx = profile.worldIds.indexOf(world.worldId);
			if (idx >= 0) {
				profile.worldIds.remove(idx);
			}

			// make new world profile
			const worldProfile = ProfileManager.Get().MakeNewWorldProfile(player);
			profile.worldIds.push(worldProfile.id);
			try {
				await ProfileManager.Get().SaveProfile(player);
			} catch (err) {
				Debug.LogError(err);
			}

			const loadedWorld = WorldManager.Get().LoadWorldFromProfile(worldProfile, player);
			if (loadedWorld) {
				WorldManager.Get().MovePlayerToLoadedWorld(player, loadedWorld);
			}

			player.SendMessage(ChatColor.Green("World deleted! A new world has been created."));
		} catch (err) {
			Debug.LogError(err);
			player.SendMessage(ChatColor.Red("Failed to save world."));
		}
	}
}
