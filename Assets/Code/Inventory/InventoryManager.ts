import { Game } from "@Easy/Core/Shared/Game";
import { ItemStack } from "@Easy/Core/Shared/Inventory/ItemStack";
import { NetworkSignal } from "@Easy/Core/Shared/Network/NetworkSignal";
import { ItemType } from "Code/Item/ItemType";

export default class InventoryManager extends AirshipSingleton {
	public spawnItemNS = new NetworkSignal<[itemType: ItemType]>("InventoryManager.SpawnItem");

	override Start(): void {
		if (Game.IsServer()) this.StartServer();
	}

	private StartServer() {
		this.spawnItemNS.server.OnClientEvent((player, itemType) => {
			player.character?.inventory.AddItem(new ItemStack(itemType));
		});
	}

	override OnDestroy(): void {}
}
