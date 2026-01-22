import { Airship } from "@Easy/Core/Shared/Airship";
import { Game } from "@Easy/Core/Shared/Game";
import { NetworkSignal } from "@Easy/Core/Shared/Network/NetworkSignal";
import { Player } from "@Easy/Core/Shared/Player/Player";
import { ChatColor } from "@Easy/Core/Shared/Util/ChatColor";
import WorldManager from "Code/World/WorldManager";
import { RedoCommand } from "./Command/RedoCommand";
import { SetCommand } from "./Command/SetCommand";
import { UndoCommand } from "./Command/UndoCommand";
import { EditAction } from "./EditInfo";
import { EditSelection, EditSelectionDto } from "./EditSelection";

export default class EditManager extends AirshipSingleton {
	public localEditSelection: EditSelectionDto | undefined;
	public playerEditSelections = new Map<string, EditSelectionDto>();
	public undoHistory = new Map<string, EditAction[]>();
	public redoHistory = new Map<string, EditAction[]>();
	public lastExpensiveOperationTime = new Map<string, number>();

	private setEditSelectionNetSig = new NetworkSignal<[selection: EditSelectionDto]>("Edit:SetSelection");
	private selectionChangedNetSig = new NetworkSignal<[connectionId: number, selection: EditSelectionDto | undefined]>(
		"Edit:SelectionChanged",
	);

	override Start(): void {
		if (Game.IsServer()) this.StartServer();
		if (Game.IsClient()) this.StartClient();
	}

	private StartServer() {
		Airship.Players.ObservePlayers((player) => {
			this.undoHistory.set(player.userId, []);
			this.redoHistory.set(player.userId, []);

			return () => {
				this.undoHistory.delete(player.userId);
				this.redoHistory.delete(player.userId);
				this.playerEditSelections.delete(player.userId);
			};
		});

		this.setEditSelectionNetSig.server.OnClientEvent((p, selection) => {
			this.playerEditSelections.set(p.userId, selection);
		});

		Airship.Chat.RegisterCommand(new SetCommand());
		Airship.Chat.RegisterCommand(new UndoCommand());
		Airship.Chat.RegisterCommand(new RedoCommand());
	}

	private StartClient() {}

	@Server()
	public IsOnExpensiveOperationCooldown(player: Player) {
		const lastTime = this.lastExpensiveOperationTime.get(player.userId);
		if (lastTime === undefined) {
			return false;
		}
		if (Time.unscaledTime - lastTime < 0.5) {
			return true;
		}
		return false;
	}

	@Server()
	public SetOnExpensiveCooldown(player: Player): void {
		this.lastExpensiveOperationTime.set(player.userId, Time.unscaledDeltaTime);
	}

	@Server()
	public AddEditHistory(player: Player, action: EditAction): void {
		this.undoHistory.get(player.userId)?.push(action);
	}

	@Server()
	public Undo(player: Player): void {
		if (this.IsOnExpensiveOperationCooldown(player)) {
			player.SendMessage(ChatColor.Red("Please wait before running this command."));
			return;
		}

		const history = this.undoHistory.get(player.userId);
		const action = history?.pop();
		if (!action) {
			player.SendMessage(ChatColor.Red("Nothing to undo."));
			return;
		}

		const world = action.GetLoadedWorld();
		if (!world) return;
		if (!world.HasBuildPermission(player)) {
			player.SendMessage(ChatColor.Red("No permission."));
			return;
		}

		this.redoHistory.get(player.userId)?.push(action);
		this.SetOnExpensiveCooldown(player);

		const positions: Vector3[] = [];
		const data: number[] = [];
		for (const edit of action.edits) {
			if (!world.IsInWorldBounds(edit.blockPosition.add(world.offset))) continue;
			positions.push(edit.blockPosition);
			data.push(edit.oldValue);
		}
		print(`${player.username} is undoing ${positions.size()} blocks.`);
		const startTime = os.clock();
		world.voxelWorld.WriteVoxelGroupAt(positions, data, true);
		print(`Took ${math.round((os.clock() - startTime) * 1000) / 1000} ms.`);
	}

	@Server()
	public Redo(player: Player): void {
		if (this.IsOnExpensiveOperationCooldown(player)) {
			player.SendMessage(ChatColor.Red("Please wait before running this command."));
			return;
		}

		const redo = this.redoHistory.get(player.userId);
		const action = redo?.pop();
		if (!action) {
			player.SendMessage(ChatColor.Red("Nothing to redo."));
			return;
		}

		const world = action.GetLoadedWorld();
		if (!world) return;
		if (!world.HasBuildPermission(player)) {
			player.SendMessage(ChatColor.Red("No permission."));
			return;
		}

		this.undoHistory.get(player.userId)?.push(action);
		this.SetOnExpensiveCooldown(player);

		const positions: Vector3[] = [];
		const data: number[] = [];
		for (const edit of action.edits) {
			if (!world.IsInWorldBounds(edit.blockPosition.add(world.offset))) continue;
			positions.push(edit.blockPosition);
			data.push(edit.newValue);
		}
		print(`${player.username} is redoing ${positions.size()} blocks.`);
		const startTime = os.clock();
		world.voxelWorld.WriteVoxelGroupAt(positions, data, true);
		print(`Took ${math.round((os.clock() - startTime) * 1000) / 1000} ms.`);
	}

	@Server()
	public GetSelection(player: Player): EditSelection | undefined {
		const dto = this.playerEditSelections.get(player.userId);
		if (!dto) return undefined;
		return EditSelection.FromDtoYielding(dto);
	}

	@Server()
	public ClearSelection(player: Player): void {
		this.playerEditSelections.delete(player.userId);
	}

	public SetLocalEditSelection(pos1: Vector3, pos2: Vector3): void {
		this.localEditSelection = {
			pos1,
			pos2,
			worldNetId: WorldManager.Get().currentLoadedWorld.networkIdentity.netId,
		};
		this.setEditSelectionNetSig.client.FireServer(this.localEditSelection);
	}

	override OnDestroy(): void {}
}
