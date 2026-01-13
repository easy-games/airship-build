import { Asset } from "@Easy/Core/Shared/Asset";
import { AudioManager } from "@Easy/Core/Shared/Audio/AudioManager";
import { ItemDef } from "@Easy/Core/Shared/Item/ItemDefinitionTypes";
import { Bin } from "@Easy/Core/Shared/Util/Bin";
import { CanvasAPI, HoverState } from "@Easy/Core/Shared/Util/CanvasAPI";
import { ItemType } from "Code/Item/ItemType";
import CreativeItemsWindow from "./CreativeItemsWindow";
import InventoryManager from "./InventoryManager";

export default class CreativeItemSlot extends AirshipBehaviour {
	@NonSerialized() public itemDef: ItemDef;
	public renderImage: Image;
	public button: Button;
	public redirectScroll: AirshipRedirectScroll;
	@NonSerialized() public window: CreativeItemsWindow;

	private bin = new Bin();

	override Start(): void {}

	public Init(itemDef: ItemDef, window: CreativeItemsWindow): void {
		this.itemDef = itemDef;
		this.window = window;

		if (itemDef.image) {
			const sprite = Asset.LoadAssetIfExists<Sprite>(itemDef.image + ".sprite");
			if (sprite) {
				this.renderImage.sprite = sprite;
			}
		}

		this.button.onClick.Connect(() => {
			if (this.redirectScroll.isDragging) return;
			AudioManager.PlayClipGlobal(Asset.LoadAsset("Assets/AirshipPackages/@Easy/Core/Sound/UI_Select.wav"));
			InventoryManager.Get().spawnItemNS.client.FireServer(this.itemDef.itemType as ItemType);
		});
		this.bin.AddEngineEventConnection(
			CanvasAPI.OnHoverEvent(this.button.gameObject, (hov) => {
				if (hov === HoverState.ENTER) {
					this.window.SetTooltip(this);
					AudioManager.PlayClipGlobal(
						Asset.LoadAsset("Assets/AirshipPackages/@Easy/Core/Sound/UI_Hover_01.wav"),
					);
				} else {
					this.window.ClearTooltip();
				}
			}),
		);
		if (CanvasAPI.IsPointerOverTarget(this.gameObject)) {
			this.window.SetTooltip(this);
		}
	}

	override OnDestroy(): void {
		this.bin.Clean();
	}
}
