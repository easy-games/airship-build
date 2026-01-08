import Character from "@Easy/Core/Shared/Character/Character";
import { ItemStack } from "@Easy/Core/Shared/Inventory/ItemStack";
import { ItemDef } from "@Easy/Core/Shared/Item/ItemDefinitionTypes";
import { Bin } from "@Easy/Core/Shared/Util/Bin";
import { OnLateUpdate, OnUpdate } from "@Easy/Core/Shared/Util/Timer";
import GameCharacter from "Code/Character/GameCharacter";
import { ItemType } from "Code/Item/ItemType";
import MultiAdditiveRotation from "Code/Misc/Aiming/MultiAdditiveRotation";

export interface SpectatorItemHandler {
	OnSpectating?(): void;
	OnStoppedSpectating?(): void;
}

/**
 * A new ItemHandlerBehaviour is instantiated whenever you equip an item.
 */
export default class ItemHandler {
	public character: Character;
	public gameCharacter: GameCharacter;
	public itemStack: ItemStack;

	protected isInit = false;
	public isLocal = false;

	/** The item types that this handler should be used on. Each item can only have one ItemHandler. */
	public itemTypes: ItemType[] = [];

	public itemDef: ItemDef;

	public idleAnimation: AnimationClip | undefined;
	public clipReplacer: AnimatorClipReplacer | undefined;
	public disableClipReplacer = false;
	public equipAnimation: AnimationClip | undefined;

	public aimRotation: MultiAdditiveRotation | undefined;

	protected tweenAimEntry = 0.5;
	protected tweenAimExit = 0.5;

	/**
	 * Cleaned when the item is unequipped
	 */
	public bin = new Bin();
	protected equipped = false;

	public static HasSpectatorEventCallbacks(value: ItemHandler): value is ItemHandler & SpectatorItemHandler {
		return "OnSpectating" in value || "OnStoppedSpectating" in value;
	}

	public GetItemData() {
		return this.itemStack.itemDef.data;
	}

	public Init(character: Character, gameCharacter: GameCharacter, itemStack: ItemStack): void {
		this.character = character;
		this.gameCharacter = gameCharacter;
		this.itemStack = itemStack;
		this.itemDef = itemStack.itemDef;
		this.isInit = true;
		this.isLocal = character.IsLocalCharacter();
		this.aimRotation = this.character.rig.gameObject.GetAirshipComponent<MultiAdditiveRotation>()!;

		if (this.itemDef.data?.item) {
			if (this.itemDef.data.item.idleAnimation) {
				this.idleAnimation = this.itemDef.data.item.idleAnimation;
			}
		}

		this.OnInit();
		this.OnEquip();

		this.bin.Add(
			OnUpdate.Connect((dt) => {
				this.Update(dt);
			}),
		);
		this.bin.Add(
			OnLateUpdate.Connect((dt) => {
				this.LateUpdate(dt);
			}),
		);
	}

	public GetItemGameObjectInHand(hand: "left" | "right"): GameObject | undefined {
		const parent = hand === "left" ? this.character.rig.heldItemL : this.character.rig.handR;
		for (const child of parent) {
			if (child.gameObject.activeInHierarchy) {
				return child.gameObject;
			}
		}
	}

	public OnInit() {}

	/**
	 * Do not override this. Instead, override OnEquip.
	 */
	public Equip(): void {
		this.OnEquip();
	}

	protected Update(dt: number): void {}

	protected LateUpdate(dt: number): void {}

	protected OnEquip(): void {
		this.equipped = true;
		if (this.clipReplacer?.enabled && !this.disableClipReplacer) {
			this.clipReplacer.ReplaceClips(this.character.animationHelper.animator);
			this.character.animationHelper.animator.SetLayerWeight(CharacterAnimationLayer.OVERRIDE_1, 1);
		} else if (this.idleAnimation) {
			this.character.animationHelper.PlayAnimation(this.idleAnimation, CharacterAnimationLayer.OVERRIDE_1, 0.1);
		}

		if (this.equipAnimation) {
			this.character.animationHelper.PlayAnimation(this.equipAnimation, CharacterAnimationLayer.OVERRIDE_1, 0.05);
		}
	}

	/**
	 * Do not override this. Instead, override OnUnequip.
	 */
	public Unequip(): void {
		this.OnUnequip();
		this.bin.Clean();
	}

	protected OnUnequip(): void {
		this.equipped = false;
		this.clipReplacer?.RemoveClips(this.character.animationHelper.animator);
		if (this.aimRotation) {
			this.aimRotation.AimInfluence(this.aimRotation.generalInfluence, 0, this.aimRotation.tweenAimExit);
		}
		this.gameCharacter.LockCharacterRotation(false);
		this.cancelOverrideClips();
	}

	public cancelOverrideClips(): void {
		this.character.animationHelper.StopAnimation(CharacterAnimationLayer.OVERRIDE_1, 0);
		this.character.animationHelper.StopAnimation(CharacterAnimationLayer.OVERRIDE_2, 0);
		this.character.animationHelper.StopAnimation(CharacterAnimationLayer.OVERRIDE_3, 0);
		this.character.animationHelper.StopAnimation(CharacterAnimationLayer.OVERRIDE_4, 0);
		this.character.animationHelper.StopAnimation(CharacterAnimationLayer.UPPER_BODY_1, 0);
		this.character.animationHelper.StopAnimation(CharacterAnimationLayer.UPPER_BODY_2, 0);
	}

	/** To be overriden */
	public AppliesToItem(itemDef: ItemDef): boolean {
		return false;
	}
}
