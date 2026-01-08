import { Airship } from "@Easy/Core/Shared/Airship";
import { Game } from "@Easy/Core/Shared/Game";
import { NetworkSignal } from "@Easy/Core/Shared/Network/NetworkSignal";
import { Player } from "@Easy/Core/Shared/Player/Player";
import { Signal } from "@Easy/Core/Shared/Util/Signal";
import { BlockUtil } from "./BlockUtil";

export type BlockData = {
	/** Block health (this won't exist if block is full health) */
	h?: number;
	/** Block flags (this is a bit mask of attributes for a block) */
	f: number;
	/** Team index (this is for blocks like beds that display differently based on their team) */
	t?: number;
	/** If this is a redirect block the root is stored in r */
	r?: Vector3;
	/** Farmer cletus crop data */
	fc?: [
		/** Timestamp of when crop was planted. */
		pa?: number,
		/** Timestamp of when crop was last harvested. */
		lha?: number,
		/** How much water time crop has received during a full growth cycle. */
		wt?: number,
		/** Whether or not the crop is currently being watered. */
		wtd?: boolean,
	];
	/** Hash of the user id who placed this block, if it exists. */
	p?: number;
};

export enum BlockDataFlag {
	Breakable = 1 << 0,
}

export default class BlockDataManager extends AirshipSingleton {
	private blockData = new Map<Vector3, BlockData>();
	private blockDataUpdate = new NetworkSignal<[Map<Vector3, Partial<BlockData>>]>("BlockDataUpdate");
	public onNewBlockData = new Signal<[position: Vector3, data: BlockData]>();

	override Start(): void {
		if (Game.IsServer()) this.StartServer();
		if (Game.IsClient()) this.StartClient();
	}

	private StartClient() {
		this.blockDataUpdate.client.OnServerEvent((newBlockData) => {
			for (const [pos, data] of newBlockData) {
				const existing = this.blockData.get(pos) ?? { f: 0 };
				const newData = { ...existing, ...data };

				this.blockData.set(pos, newData);
				this.onNewBlockData.Fire(pos, newData);
			}
		});
	}

	private StartServer() {
		Airship.Players.ObservePlayers((player) => {
			this.blockDataUpdate.server.FireClient(player, this.blockData);
		});
	}

	public RegisterBlockData(position: Vector3, data: BlockData, disableNetworking = false) {
		position = BlockUtil.FloorPos(position);
		this.blockData.set(position, data);

		if (Game.IsServer()) {
			if (!disableNetworking)
				this.blockDataUpdate.server.FireAllClients(new Map<Vector3, Partial<BlockData>>([[position, data]]));
		}
	}

	public UnregisterBlockData(position: Vector3) {
		this.blockData.delete(position);
	}

	public GetBlockData(position: Vector3) {
		position = BlockUtil.FloorPos(position);
		return this.blockData.get(position);
	}

	public HasAllFlags(position: Vector3, flags: number): boolean {
		const entry = this.blockData.get(position);
		if (!entry) return false;

		return (entry.f & flags) === flags;
	}

	public UpdateBlockData(position: Vector3, update: Partial<BlockData>, networkExcludePlayer?: Player) {
		const existing = this.blockData.get(position);
		if (!existing) {
			warn("Tried to UpdateBlockData on block without data. Use RegisterBlockData.");
			return;
		}

		this.blockData.set(position, { ...existing, ...update });
		if (Game.IsServer()) {
			const data = new Map<Vector3, Partial<BlockData>>([[position, update]]);
			if (networkExcludePlayer) {
				this.blockDataUpdate.server.FireExcept(networkExcludePlayer, data);
			} else {
				this.blockDataUpdate.server.FireAllClients(data);
			}
		}
	}

	public UpdateBlockDataGroup(positions: Vector3[], updates: Partial<BlockData>[]) {
		const blockMap = new Map<Vector3, Partial<BlockData>>();
		for (let i = 0; i < positions.size(); i++) {
			const position = positions[i];
			const existing = this.blockData.get(position);
			if (!existing) {
				warn("Tried to UpdateBlockData on block without data. Use RegisterBlockData.");
				return;
			}

			const update = updates[i];
			this.blockData.set(position, { ...existing, ...update });
			blockMap.set(position, update);
		}

		if (Game.IsServer() && blockMap.size() > 0) {
			this.blockDataUpdate.server.FireAllClients(blockMap);
		}
	}
}

export function GetBlockData(blockDataConfig: {
	/** Health of the block, don't include if block should exist at full health */
	health?: number;
	/** True if this block is meant to be breakable by players */
	breakable?: boolean;
	/** Sets the team index for a block (for stuff like beds which are team specific) */
	teamIndex?: number;
	/** Sets the block redirect (point at the root position of this block) */
	redirect?: Vector3;
	/** Sets Farmer Cletus block data (if this block is a crop) */
	cletus?: [
		/** When the crop was planted */
		plantedAt: number,
		/** When the crop was last harvested */
		lastHarvestedAt: number,
		/** How much water time crop received during full growth cycle */
		waterTime: number,
		/** Whether or not the crop is currently being watered. */
		watering: boolean,
	];
}): BlockData | undefined {
	let flags = 0;
	if (blockDataConfig.breakable) flags |= BlockDataFlag.Breakable;

	// Does this block have any custom data?
	if (
		flags === 0 &&
		blockDataConfig.health === undefined &&
		blockDataConfig.teamIndex === undefined &&
		blockDataConfig.redirect === undefined &&
		blockDataConfig.cletus === undefined
	) {
		return undefined;
	}
	return {
		h: blockDataConfig.health,
		f: flags,
		t: blockDataConfig.teamIndex,
		r: blockDataConfig.redirect,
		fc: [
			blockDataConfig.cletus?.[0],
			blockDataConfig.cletus?.[1],
			blockDataConfig.cletus?.[2],
			blockDataConfig.cletus?.[3],
		],
	};
}
