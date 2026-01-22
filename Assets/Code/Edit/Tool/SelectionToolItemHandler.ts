import { Airship } from "@Easy/Core/Shared/Airship";
import { AudioManager } from "@Easy/Core/Shared/Audio/AudioManager";
import { Game } from "@Easy/Core/Shared/Game";
import { InputActionEvent } from "@Easy/Core/Shared/Input/InputActionEvent";
import { ItemDef } from "@Easy/Core/Shared/Item/ItemDefinitionTypes";
import { ChatColor } from "@Easy/Core/Shared/Util/ChatColor";
import { OnLateUpdate } from "@Easy/Core/Shared/Util/Timer";
import { BlockBreakerItemHandler } from "Code/Block/BlockBreakerItemHandler";
import { ActionId } from "Code/Input/ActionId";
import { ItemType } from "Code/Item/ItemType";
import ItemHandler from "Code/ItemHandler/ItemHandler";
import EditManager from "../EditManager";
import SelectionToolRefs from "./SelectionToolRefs";

let hasSentHelpMessage = false;

export class SelectionToolItemHandler extends ItemHandler {
	private refs = SelectionToolRefs.Get();

	public OnInit(): void {
		super.OnInit();
	}

	protected OnEquip(): void {
		super.OnEquip();

		if (this.isLocal) {
			this.bin.Add(
				OnLateUpdate.Connect((dt) => {
					this.UpdateSelectionOutline();
				}),
			);

			this.bin.Add(Airship.Input.OnDown(ActionId.SelectionPos1)).Connect((e) => {
				this.HandleSelectionPos("pos1", e);
			});
			this.bin.Add(Airship.Input.OnDown(ActionId.SelectionPos2)).Connect((e) => {
				this.HandleSelectionPos("pos2", e);
			});

			if (!hasSentHelpMessage) {
				hasSentHelpMessage = true;
				Game.localPlayer.SendMessage(
					ChatColor.Yellow(
						"This is the selection tool. Use Left/Right click to make a selection. Then use " +
							ChatColor.Aqua("/set <block>") +
							" to fill. You can also use " +
							ChatColor.Aqua("/undo") +
							" and " +
							ChatColor.Aqua("/redo") +
							".",
					),
				);
			}
		}
	}
	private HandleSelectionPos(pos: "pos1" | "pos2", e: InputActionEvent) {
		if (e.uiProcessed) return;

		const info = BlockBreakerItemHandler.GetTargetVoxelPositionAndRaycastInfo(100);
		if (!info) return;

		if (info) {
			const edit = EditManager.Get();
			let pos1: Vector3;
			let pos2: Vector3;
			if (pos === "pos1") {
				pos1 = info.voxelWorldPosition;
				pos2 = edit.localEditSelection?.pos2 ?? pos1;
				Game.localPlayer.SendMessage("Set pos1.");
				AudioManager.PlayGlobal("Assets/AirshipPackages/@Easy/Core/Sound/UI_Switch.wav", {
					pitch: 1,
					volumeScale: 0.7,
				});
			} else {
				pos2 = info.voxelWorldPosition;
				pos1 = edit.localEditSelection?.pos1 ?? pos2;
				Game.localPlayer.SendMessage("Set pos2.");
				AudioManager.PlayGlobal("Assets/AirshipPackages/@Easy/Core/Sound/UI_Switch.wav", {
					pitch: 1.2,
					volumeScale: 0.7,
				});
			}
			edit.SetLocalEditSelection(pos1, pos2);
		}
	}

	private UpdateSelectionOutline() {
		const edit = EditManager.Get();
		if (!edit.localEditSelection) {
			this.refs.selectionOutline.gameObject.SetActive(false);
			return;
		}
		const selectionOutline = this.refs.selectionOutline;
		selectionOutline.gameObject.SetActive(true);

		const max = Vector3.Max(edit.localEditSelection.pos1, edit.localEditSelection.pos2);
		const min = Vector3.Min(edit.localEditSelection.pos1, edit.localEditSelection.pos2);

		const center = min.Lerp(max, 0.5).add(Vector3.one.mul(0.5));
		selectionOutline.position = center;
		const diff = max.sub(min);
		selectionOutline.localScale = new Vector3(diff.x + 1, diff.y + 1, diff.z + 1).mul(100);
	}

	protected OnUnequip(): void {
		super.OnUnequip();
		this.refs.selectionOutline.gameObject.SetActive(false);
	}

	public AppliesToItem(itemDef: ItemDef): boolean {
		return itemDef.itemType === ItemType.SelectionTool;
	}
}
