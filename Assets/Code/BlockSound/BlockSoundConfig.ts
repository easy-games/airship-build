import { BlockMaterialType } from "Code/Item/BlockMaterialType";

@CreateAssetMenu("Block Sound Config")
export default class BlockSoundConfig extends AirshipScriptableObject {
	public blockMaterial: BlockMaterialType;
	public hit?: AudioResource;
	public break?: AudioResource;
	public place?: AudioResource;
	public hitNegated?: AudioResource;
}
