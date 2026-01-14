import { Airship } from "@Easy/Core/Shared/Airship";
import { Game } from "@Easy/Core/Shared/Game";
import { Binding } from "@Easy/Core/Shared/Input/Binding";
import { SignalPriority } from "@Easy/Core/Shared/Util/Signal";
import { ActionId } from "./ActionId";
import { SettingId } from "./SettingId";

export default class GameInputManager extends AirshipSingleton {
	protected Awake(): void {
		Airship.Input.CreateAction(ActionId.PlaceBlock, Binding.MouseButton(MouseButton.LeftButton), {
			hidden: true,
		});
		Airship.Input.CreateAction(ActionId.BreakBlock, Binding.MouseButton(MouseButton.LeftButton), {
			hidden: true,
		});
		Airship.Input.CreateAction(ActionId.SelectBlock, Binding.MouseButton(MouseButton.MiddleButton));
		Airship.Input.CreateAction(ActionId.Dashboard, Binding.Key(Key.Tab));

		Airship.Settings.AddToggle(SettingId.BW2_Placement, false);

		if (Game.IsMobile()) {
			const breakBtn = Airship.Input.CreateMobileButton(ActionId.BreakBlock, new Vector2(-338, 475), {
				icon: "Assets/Resources/MobileBtnIcons/PickAxe_ICON.png",
				scale: Vector2.one.mul(0.8),
			});
			Airship.Input.OnDown(ActionId.BreakBlock).ConnectWithPriority(SignalPriority.HIGHEST, (e) => {
				const character = Game.localPlayer.character;
				if (!character) return;

				if (!character.heldItem?.itemDef.data?.blockBreaker) {
					// find block breaker item
					for (let i = 0; i <= 8; i++) {
						if (character.inventory.GetItem(i)?.itemDef.data?.blockBreaker) {
							character.SetHeldSlot(i);
							break;
						}
					}
				}
			});
		}
	}
}
