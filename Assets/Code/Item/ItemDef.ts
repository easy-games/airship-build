import { BlockMaterialType } from "./BlockMaterialType";
import { ItemType } from "./ItemType";

declare module "@Easy/Core/Shared/Item/ItemDefinitionTypes" {
	export interface ItemDefExtraData {
		description?: string;

		/** Data for a placeable block */
		block?: {
			voxelName: string;
			health: number;
			materialType: BlockMaterialType;
			/** This is for blocks that should occupy more than one position */
			size?: Vector3;
			/**
			 * Multiplier on effective block health when hit by explosives. For example a value of
			 * 2 would make a block be effectively twice as tanky when impacted by fireballs.
			 */
			explosionResistance?: number;
			/**
			 * By default blocks can be placed over void. Set to true to disable this behavior.
			 */
			disallowPlaceOverVoid?: boolean;
			/**
			 * Disallow placing this block over certain item types
			 */
			disallowPlaceOverItemTypes?: ItemType[];
		};
		/** Allow placing this item inside of deny regions & outside the map boundary.
		 *
		 * This is located outside of the `block` section because some non-blocks use block placement rules (TNT).
		 */
		blockAllowPlaceAnywhere?: boolean;
		/** Is this a wool block */
		wool?: boolean;

		item?: {
			idleAnimation?: AnimationClip;
			// equipAnimation?: string;
			// disableClipReplacer?: boolean;
		};
	}
}
