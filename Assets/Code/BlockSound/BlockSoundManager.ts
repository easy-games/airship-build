import { Airship } from "@Easy/Core/Shared/Airship";
import { Asset } from "@Easy/Core/Shared/Asset";
import { AudioManager } from "@Easy/Core/Shared/Audio/AudioManager";
import { Game } from "@Easy/Core/Shared/Game";
import ObjectUtils from "@Easy/Core/Shared/Util/ObjectUtils";
import { BlockMaterialType } from "Code/Item/BlockMaterialType";
import { ItemType } from "Code/Item/ItemType";
import CacheManager from "Code/Misc/CacheManager";
import SoundManager, { AudioRolloffType } from "Code/Sound/SoundManager";
import BlockSoundConfig from "./BlockSoundConfig";

export default class BlockSoundManager extends AirshipSingleton {
	/** The pitch of the first hit against a block. Pitch will scale up to Min Health Pitch throughout the break. */
	@Header("Config")
	public blockHitMaxHealthPitch = 0.95;
	/** The pitch of the final hit against a block before it breaks. Pitch will scale up to Min Health Pitch throughout the break. */
	public blockHitMinHealthPitch = 1.1;

	private soundConfigMap = new Map<BlockMaterialType, BlockSoundConfig>();

	override Start(): void {
		for (const material of ObjectUtils.values(BlockMaterialType)) {
			const path = `Assets/Resources/BlockSoundConfigs/${material}.asset`;
			try {
				const soundConfig = Asset.LoadAssetIfExists<BlockSoundConfig>(path);
				if (soundConfig) {
					this.soundConfigMap.set(material, soundConfig);
				}
			} catch (err) {}
		}
	}

	public PlayHitSound(itemType: ItemType, position: Vector3, percentHealth: number) {
		// Distance Culling
		if (CacheManager.Get().mainCameraPosition.sub(position).sqrMagnitude > math.pow(30, 2)) {
			return;
		}

		percentHealth = math.clamp01(percentHealth);
		const materialType =
			Airship.Inventory.GetItemDef(itemType).data?.block?.materialType ?? BlockMaterialType.Stone;
		const soundConfig = this.soundConfigMap.get(materialType);
		if (soundConfig?.hit) {
			AudioManager.PlayClipAtPosition(soundConfig.hit, position, {
				pitch: this.GetHitPitchModifier(percentHealth),
				...SoundManager.Get().GetAudioConfig(AudioRolloffType.MidClose),
			});
		}
	}

	public PlayHitNegatedSound(position: Vector3, blockItemType?: ItemType) {
		if (CacheManager.Get().mainCameraPosition.sub(position).sqrMagnitude > math.pow(30, 2)) {
			return;
		}

		let materialType: BlockMaterialType = BlockMaterialType.Stone;
		if (blockItemType) {
			const blockMaterial = Airship.Inventory.GetItemDef(blockItemType).data?.block?.materialType;
			if (Game.IsEditor()) {
				if (!blockMaterial) {
					warn(
						`[BlockSounds] Block has no material type defaulted to stone sound: [Item Type: ${blockItemType}]`,
					);
				}
			}
			materialType = blockMaterial ?? BlockMaterialType.Stone;
		} else {
			if (Game.IsEditor()) {
				const blockId = VoxelWorld.GetFirstInstance().GetVoxelAt(position);
				const blockName = VoxelWorld.GetFirstInstance().voxelBlocks.GetStringIdFromBlockId(blockId);
				warn(
					`[BlockSounds] Block has no itemtype defaulted to stone sound: [ Name: ${blockName} Block ID: ${blockId} ]`,
				);
			}
		}

		const soundConfig = this.soundConfigMap.get(materialType);
		if (soundConfig?.hitNegated) {
			AudioManager.PlayClipAtPosition(soundConfig.hitNegated, position, {
				...SoundManager.Get().GetAudioConfig(AudioRolloffType.MidClose),
			});
		} else {
			if (Game.IsEditor()) {
				warn(`[BlockSounds] Material Type has no hit negated sound set on config: ${materialType}`);
			}
		}
	}

	public GetHitPitchModifier(percentHealth: number) {
		return percentHealth * this.blockHitMaxHealthPitch + (1 - percentHealth) * this.blockHitMinHealthPitch;
	}

	public PlayBreakSound(itemType: ItemType, position: Vector3) {
		const materialType =
			Airship.Inventory.GetItemDef(itemType).data?.block?.materialType ?? BlockMaterialType.Stone;
		const soundConfig = this.soundConfigMap.get(materialType);
		if (soundConfig?.break) {
			AudioManager.PlayClipAtPosition(soundConfig.break, position, {
				...SoundManager.Get().GetAudioConfig(AudioRolloffType.MidClose),
			});
		}
	}

	public PlayPlaceSound(itemType: ItemType, position: Vector3) {
		const materialType =
			Airship.Inventory.GetItemDef(itemType).data?.block?.materialType ?? BlockMaterialType.Stone;
		const soundConfig = this.soundConfigMap.get(materialType);
		if (soundConfig?.place) {
			AudioManager.PlayClipAtPosition(soundConfig.place, position, {
				...SoundManager.Get().GetAudioConfig(AudioRolloffType.MidClose),
			});
		}
	}
}
