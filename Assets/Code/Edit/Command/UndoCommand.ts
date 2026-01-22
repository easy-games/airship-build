import { ChatCommand } from "@Easy/Core/Shared/Commands/ChatCommand";
import { Player } from "@Easy/Core/Shared/Player/Player";
import EditManager from "../EditManager";

export class UndoCommand extends ChatCommand {
	constructor() {
		super("undo", undefined, undefined, undefined, false);
	}
	public Execute(player: Player, args: string[]): void {
		EditManager.Get().Undo(player);
	}
}
