import { Player } from "@Easy/Core/Shared/Player/Player";
import { Cancellable } from "@Easy/Core/Shared/Util/Cancellable";
import ItemManager from "Code/Item/ItemManager";

export class BlockPlaceEvent extends Cancellable {
	constructor(public position: Vector3, public player: Player | undefined, public blockId: number) {
		super();
	}

	public GetItemType() {
		return ItemManager.Get().GetItemTypeFromVoxelId(this.blockId);
	}
}
