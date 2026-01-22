import { Player } from "@Easy/Core/Shared/Player/Player";
import { ChatColor } from "@Easy/Core/Shared/Util/ChatColor";
import WorldManager from "Code/World/WorldManager";
import { EditAction } from "../EditInfo";
import EditManager from "../EditManager";
import { EditBaseCommand } from "./EditBaseCommand";

export class SetCommand extends EditBaseCommand {
	constructor() {
		super("set", undefined, "<block>", "Sets a region to a block type");
	}
	public Execute(player: Player, args: string[]): void {
		if (!super.ValidateWorldPermission(player)) return;
		if (EditManager.Get().IsOnExpensiveOperationCooldown(player)) {
			player.SendMessage(ChatColor.Red("Please wait before running this command."));
			return;
		}

		const selection = EditManager.Get().GetSelection(player);
		if (!selection) {
			player.SendMessage(ChatColor.Red("No selection."));
			return;
		}

		const blockName = args.join(" ").lower();
		let blockId;
		if (blockName === "air") {
			blockId = 0;
		} else {
			blockId = WorldManager.Get().voxelBlocks.SearchForBlockIdByString(blockName);
			if (blockId === 0) {
				player.SendMessage(ChatColor.Red("Unknown block: " + blockName));
				return;
			}
		}
		const blockDef = WorldManager.Get().voxelBlocks.GetBlockDefinitionFromBlockId(blockId) as
			| BlockDefinition
			| undefined;
		const world = WorldManager.Get().GetCurrentLoadedWorldFromPlayer(player)!;
		const positions = selection.GetBlockPositions();
		player.SendMessage(
			ChatColor.Green(`Setting ${positions.size()} blocks to ` + (blockDef?.definition.name ?? "air")),
		);
		const oldData = world.voxelWorld.BulkReadVoxels(positions);
		const newData = positions.map((pos) => {
			return blockId;
		});

		if (positions.size() > 5_000) {
			player.SendMessage(ChatColor.Red("Too many blocks in selection."));
			return;
		}

		EditManager.Get().AddEditHistory(player, new EditAction().WithGroupEdit(world, positions, oldData, newData));
		EditManager.Get().SetOnExpensiveCooldown(player);

		print(`${player.username} is setting ${positions.size()} blocks.`);
		const startTime = os.clock();
		world?.voxelWorld.WriteVoxelGroupAt(positions, newData, true);
		print(`Took ${math.round((os.clock() - startTime) * 1000) / 1000} ms.`);
	}
}
