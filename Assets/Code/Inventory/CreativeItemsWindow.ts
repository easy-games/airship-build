import { Airship } from "@Easy/Core/Shared/Airship";
import { Bin } from "@Easy/Core/Shared/Util/Bin";
import { CanvasAPI } from "@Easy/Core/Shared/Util/CanvasAPI";
import { ItemType } from "Code/Item/ItemType";
import CreativeItemSlot from "./CreativeItemSlot";

export default class CreativeItemsWindow extends AirshipBehaviour {
	public content: RectTransform;
	public itemSlotPrefab: GameObject;
	public scrollRect: ScrollRect;
	public searchField: TMP_InputField;
	public itemTypeMap = new Map<ItemType, CreativeItemSlot>();
	public tooltip: GameObject;
	public tooltipText: TMP_Text;
	private tooltipTarget: CreativeItemSlot | undefined;

	private bin = new Bin();

	protected OnEnable(): void {
		this.searchField.text = "";
		this.tooltip.SetActive(false);
	}

	protected OnDisable(): void {
		this.tooltip.SetActive(false);
	}

	override Start(): void {
		this.content.gameObject.ClearChildren();
		for (const itemType of Airship.Inventory.GetItemTypes()) {
			const itemDef = Airship.Inventory.GetItemDef(itemType);
			const slotComp = Instantiate(this.itemSlotPrefab, this.content).GetAirshipComponent<CreativeItemSlot>()!;
			slotComp.gameObject.name = itemDef.displayName;
			slotComp.Init(itemDef, this);
			this.itemTypeMap.set(itemType as ItemType, slotComp);
		}
		for (const redirectScroll of this.content.gameObject.GetComponentsInChildren<AirshipRedirectScroll>()) {
			redirectScroll.redirectTarget = this.scrollRect;
		}

		this.bin.AddEngineEventConnection(
			CanvasAPI.OnValueChangeEvent(this.searchField.gameObject, (val) => {
				this.FilterSearch();
			}),
		);
	}

	public SetTooltip(slot: CreativeItemSlot): void {
		this.tooltipText.text = slot.itemDef.displayName;
		this.tooltip.SetActive(true);
		this.tooltipTarget = slot;
	}

	protected Update(dt: number): void {
		if (this.tooltipTarget) {
			this.tooltip.transform.position = this.tooltipTarget.transform.position.sub(new Vector3(0, 55, 0));
		}
	}

	public ClearTooltip(): void {
		this.tooltip.SetActive(false);
	}

	private FilterSearch(): void {
		const searchText = this.searchField.text;
		if (searchText === "") {
			for (const child of this.content) {
				child.gameObject.SetActive(true);
			}
			return;
		}

		for (const [itemType, slot] of this.itemTypeMap) {
			const itemDef = Airship.Inventory.GetItemDef(itemType)!;
			if (itemDef.displayName.lower().find(searchText.lower(), 1, true)[0] !== undefined) {
				slot.gameObject.SetActive(true);
				continue;
			}
			slot.gameObject.SetActive(false);
		}
	}

	override OnDestroy(): void {
		this.bin.Clean();
	}
}
