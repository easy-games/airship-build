import { Airship } from "@Easy/Core/Shared/Airship";
import Character from "@Easy/Core/Shared/Character/Character";
import { ItemDefExtraData } from "@Easy/Core/Shared/Item/ItemDefinitionTypes";
import { Bin } from "@Easy/Core/Shared/Util/Bin";
import { SignalPriority } from "@Easy/Core/Shared/Util/Signal";
import { BlockBreakerItemHandler } from "Code/Block/BlockBreakerItemHandler";
import BlockItemHandler from "Code/Block/BlockItemHandler";
import { BlockUtil } from "Code/Block/BlockUtil";
import GameCharacter from "Code/Character/GameCharacter";
import ItemHandler from "Code/ItemHandler/ItemHandler";
import WorldManager from "Code/World/WorldManager";
import { BlockMaterialType } from "./BlockMaterialType";
import { ItemType } from "./ItemType";

type ItemHandlerConstructor = { new (): ItemHandler };

const DISABLED_BLOCKS = ["Redirect", "DefaultGrass", "DefaultDirt", "Chest", "Slime", "LaunchPad"];

// ********************************* //
// **** PUT ITEM HANDLERS HERE ***** //
// ********************************* //
const itemHandlerConstructors: ItemHandlerConstructor[] = [BlockItemHandler, BlockBreakerItemHandler];

export default class ItemManager extends AirshipSingleton {
	@NonSerialized() public itemTypeToItemHandlerConstructor = new Map<ItemType, ItemHandlerConstructor>();
	@NonSerialized() public characterToItemHandler = new Map<Character, ItemHandler>();

	override Awake(): void {
		this.RegisterItems();
	}

	protected Start(): void {
		this.SetupItemHandlers();
	}

	private ItemHandlerFactory(
		constructors: { new (): ItemHandler }[],
	): { c: ItemHandlerConstructor; handler: ItemHandler }[] {
		const results = [];
		for (const c of constructors) {
			results.push({
				c,
				handler: new c(),
			});
		}
		return results;
	}

	private SetupItemHandlers(): void {
		const factoryClasses = this.ItemHandlerFactory(itemHandlerConstructors);

		factoryClasses.forEach((entry, index) => {
			if (entry.handler.itemTypes) {
				for (const itemType of entry.handler.itemTypes) {
					if (this.itemTypeToItemHandlerConstructor.has(itemType)) {
						continue;
					}
					this.itemTypeToItemHandlerConstructor.set(itemType, entry.c);
				}
			}

			// Process AppliesToItem
			for (const itemType of Airship.Inventory.GetItemTypes() as ItemType[]) {
				const def = Airship.Inventory.GetItemDef(itemType);
				if (!entry.handler.AppliesToItem(def)) continue;

				if (this.itemTypeToItemHandlerConstructor.has(itemType)) {
					continue;
				}
				this.itemTypeToItemHandlerConstructor.set(itemType, entry.c);
			}
		});

		Airship.Characters.ObserveCharacters((character) => {
			const gameCharacter = character.gameObject.GetAirshipComponent<GameCharacter>()!;
			const heldItemBin = new Bin();
			character.ObserveHeldItem((itemStack) => {
				heldItemBin.Clean();
				const existing = this.characterToItemHandler.get(character);
				if (existing) {
					existing.Unequip();
					this.characterToItemHandler.delete(character);
				}

				if (itemStack && character.IsAlive()) {
					const c = this.itemTypeToItemHandlerConstructor.get(itemStack.itemType as ItemType);
					if (c) {
						const newHandler = new c();
						this.characterToItemHandler.set(character, newHandler);
						newHandler.Init(character, gameCharacter, itemStack);
						// if (newHandler) {
						// 	const signatureHandler = SignatureAttackManager.Get().GetSignatureHandlerForPlayer(
						// 		character.player!,
						// 	);
						// 	newHandler.SetSignatureAttack(signatureHandler);
						// 	signatureHandler?.SetItemHandler(newHandler);
						// }
					}

					// if (character.IsLocalCharacter()) {
					// 	if (!itemStack.itemDef.data?.noDrop) {
					// 		heldItemBin.Add(HudControlsManager.Get().AddHudControlDisplay(HudControlDisplay.DropItem));
					// 	}
					// }
				}
			}, SignalPriority.HIGH);

			// character despawn
			return () => {
				heldItemBin.Clean();
				const existingItemHandler = this.characterToItemHandler.get(character);
				if (existingItemHandler) {
					existingItemHandler.Unequip();
				}
			};
		});
	}

	private RegisterItems(): void {
		const voxelBlocks = WorldManager.Get().voxelBlocks;
		for (const blockList of voxelBlocks.blockDefinitionLists) {
			const scope = blockList.scope;
			for (const blockDef of blockList.blockDefinitions) {
				const blockName = blockDef.ToString().split(" (VoxelBlockDefinition)")[0];
				if (DISABLED_BLOCKS.includes(blockName)) {
					continue;
				}
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
		this.SetBlockMaterial(BlockMaterialType.Grass, [
			"Grass",
			"Dirt",
			"Canopy",
			"Jungle Dirt",
			"Grass - Spirit",
			"Jungle Floor - Grass",
			"Sand",
			"Grass - Blossom",
		]);
		this.SetBlockMaterial(BlockMaterialType.Ceramic, ["Ceramic"]);
		this.SetBlockMaterial(BlockMaterialType.Obsidian, ["Obsidian"]);
		this.SetBlockMaterial(BlockMaterialType.Wool, [
			"WhiteWool",
			"PinkWool",
			"BlueWool",
			"YellowWool",
			"OrangeWool",
			"GreenWool",
			"TNT",
		]);
		this.SetBlockMaterial(BlockMaterialType.Wood, [
			"Wood - Post -  Vertical",
			"Wood - Post - Stair",
			"Winter Wood",
			"Bark",
		]);

		Airship.Inventory.RegisterItem(ItemType.EmeraldPickaxe, {
			displayName: "Emerald Pickaxe",
			accessoryPaths: ["Assets/Resources/Items/Pickaxe/EmeraldPickaxeAcc.prefab"],
			image: "Assets/Resources/ItemRenders/EmeraldPickaxe.png",
			data: {
				blockBreaker: { damagePerHit: 7, secsPerHit: 0.25 },
				description: "Fitted with a polished emerald head, designed to maximize break speed.",
			},
		});
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

	public GetItemTypeFromVoxelName(voxelName: string): ItemType | undefined {
		// todo: add a cache
		for (const itemType of Airship.Inventory.GetItemTypes()) {
			const itemDef = Airship.Inventory.GetItemDef(itemType);
			if (itemDef.data?.block?.voxelName === voxelName) {
				return itemType as ItemType;
			}
		}

		return undefined;
	}

	/**
	 * Returns the item definition that matches provided voxel id, if it exists.
	 *
	 * @param voxelData Data returned by VoxelWorld.GetVoxelAt.
	 * @returns Item definition that matches voxel item type, if it exists. Otherwise `undefined`.
	 */
	public GetItemDataFromVoxelData(voxelData: number): ItemDefExtraData | undefined {
		const blockId = BlockUtil.VoxelDataToBlockId(voxelData);
		const itemType = this.GetItemTypeFromVoxelId(blockId);
		if (!itemType) return undefined;
		return Airship.Inventory.GetItemDef(itemType).data;
	}

	/**
	 * Returns item type that matches voxel item type, if it exists.
	 *
	 * @param voxelId A voxel id.
	 * @returns Item type that matches voxel item type, if it exists. Otherwise `undefined`.
	 */
	public GetItemTypeFromVoxelId(voxelId: number): ItemType | undefined {
		const name = WorldManager.Get().voxelBlocks.GetStringIdFromBlockId(voxelId);
		return this.GetItemTypeFromVoxelName(name);
	}

	/**
	 * Returns the block id associated with an item type. If the passed
	 * in item type doesn't correspond to a voxel block this returns undefined.
	 */
	public GetBlockIdFromItemType(itemType: ItemType): number | undefined {
		const voxelName = Airship.Inventory.GetItemDef(itemType).data?.block?.voxelName;
		if (!voxelName) return;

		return WorldManager.Get().voxelBlocks.GetBlockIdFromStringId(voxelName);
	}

	public GetWoolFromTeamId(teamId: string): ItemType {
		switch (teamId) {
			case "orange":
				return ItemType.OrangeWool;
			case "pink":
				return ItemType.PinkWool;
			case "yellow":
				return ItemType.YellowWool;
			case "blue":
				return ItemType.BlueWool;
		}
		return ItemType.WhiteWool;
	}
}
