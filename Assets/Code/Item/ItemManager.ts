import { Airship } from "@Easy/Core/Shared/Airship";
import { ItemDefExtraData } from "@Easy/Core/Shared/Item/ItemDefinitionTypes";
import { BlockMaterialType } from "./BlockMaterialType";
import { ItemType } from "./ItemType";

export default class ItemManager extends AirshipSingleton {
	override Awake(): void {
		this.RegisterItems();
	}

	protected Start(): void {}

	private RegisterItems(): void {
		const voxelBlocks = VoxelWorld.GetFirstInstance().voxelBlocks;
		for (const blockList of voxelBlocks.blockDefinitionLists) {
			const scope = blockList.scope;
			for (const blockDef of blockList.blockDefinitions) {
				const blockName = blockDef.ToString().split(" (VoxelBlockDefinition)")[0];
				const voxelName = `${scope}:${blockName}`;
				Airship.Inventory.RegisterItem(blockName, {
					displayName: blockName,
					accessoryPaths: ["Assets/Resources/Items/Block/BlockAcc.prefab"],
					image: `Assets/Resources/ItemRenders/${blockName}.png`,
					data: {
						block: {
							voxelName: voxelName,
							health: 100,
							materialType: BlockMaterialType.Stone,
						},
					},
				});
			}
		}
		this.SetBlockMaterial(BlockMaterialType.Grass, ["Grass", "Dirt"]);
		this.SetBlockMaterial(BlockMaterialType.Ceramic, ["Ceramic"]);
		this.SetBlockMaterial(BlockMaterialType.Obsidian, ["Obsidian"]);
	}

	private SetBlockMaterial(material: BlockMaterialType, itemIds: string[]): void {
		for (const itemId of itemIds) {
			const itemDef = Airship.Inventory.GetItemDef(itemId);
			if (!itemDef) {
				error("Invalid itemType when setting block material: " + itemIds);
			}
			itemDef.data!.block!.materialType = material;
		}
	}

	private RegisterBlockItem(
		itemType: ItemType,
		blockData: {
			displayName: string;
			voxelName: string;
			health: number;
			material: BlockMaterialType;
			size?: Vector3;
			placeSounds?: string[];
			explosionResistance?: number;
			/** Replacement for item id when looking for item render */
			imageId?: string;
		},
		extraData?: Partial<ItemDefExtraData>,
	): void {
		let voxelName: string;
		if (blockData.voxelName.includes("@")) {
			voxelName = blockData.voxelName;
		} else {
			voxelName = `@Easy/VoxelWorld:${blockData.voxelName}`;
		}
		Airship.Inventory.RegisterItem(itemType, {
			displayName: blockData.displayName,
			accessoryPaths: ["Assets/Resources/Items/Block/BlockAcc.prefab"],
			image: `Assets/Resources/ItemRenders/${blockData.imageId ?? itemType}.png`,
			data: {
				block: {
					voxelName: voxelName,
					health: blockData.health,
					size: blockData.size,
					explosionResistance: blockData.explosionResistance,
					materialType: blockData.material,
					// sound
				},
				...extraData,
			},
		});
	}
}
