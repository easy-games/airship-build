import { ChatCommand } from "@Easy/Core/Shared/Commands/ChatCommand";
import { Player } from "@Easy/Core/Shared/Player/Player";
import EditManager from "../EditManager";

export class RedoCommand extends ChatCommand {
	constructor() {
		super("redo", undefined, undefined, undefined, false);
	}
	public Execute(player: Player, args: string[]): void {
		EditManager.Get().Redo(player);
	}
}
