import { Asset } from "@Easy/Core/Shared/Asset";
import { ItemDef } from "@Easy/Core/Shared/Item/ItemDefinitionTypes";
import { Bin } from "@Easy/Core/Shared/Util/Bin";
import { ItemType } from "Code/Item/ItemType";
import InventoryManager from "./InventoryManager";

export default class CreativeItemSlot extends AirshipBehaviour {
	@NonSerialized() public itemDef: ItemDef;
	public renderImage: Image;
	public button: Button;
	public redirectScroll: AirshipRedirectScroll;

	private bin = new Bin();

	override Start(): void {}

	public Init(itemDef: ItemDef): void {
		this.itemDef = itemDef;

		if (itemDef.image) {
			const sprite = Asset.LoadAssetIfExists<Sprite>(itemDef.image + ".sprite");
			if (sprite) {
				this.renderImage.sprite = sprite;
			}
		}

		this.button.onClick.Connect(() => {
			if (this.redirectScroll.isDragging) return;
			InventoryManager.Get().spawnItemNS.client.FireServer(this.itemDef.itemType as ItemType);
		});
	}

	override OnDestroy(): void {
		this.bin.Clean();
	}
}
