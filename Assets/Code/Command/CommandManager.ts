import { Airship } from "@Easy/Core/Shared/Airship";
import { Game } from "@Easy/Core/Shared/Game";
import DelWorldCommand from "./DelWorldCommand";
import SaveCommand from "./SaveCommand";
import WorldsCommand from "./WorldsCommand";

export default class CommandManager extends AirshipSingleton {
	override Start(): void {
		if (Game.IsServer()) {
			Airship.Chat.RegisterCommand(new SaveCommand());
			Airship.Chat.RegisterCommand(new DelWorldCommand());
			Airship.Chat.RegisterCommand(new WorldsCommand());
		}
	}
}
