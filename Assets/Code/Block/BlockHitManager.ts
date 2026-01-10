import { Airship } from "@Easy/Core/Shared/Airship";
import { AudioManager } from "@Easy/Core/Shared/Audio/AudioManager";
import Character from "@Easy/Core/Shared/Character/Character";
import { Game } from "@Easy/Core/Shared/Game";
import { NetworkSignal } from "@Easy/Core/Shared/Network/NetworkSignal";
import { Player } from "@Easy/Core/Shared/Player/Player";
import { Cancellable } from "@Easy/Core/Shared/Util/Cancellable";
import { MapUtil } from "@Easy/Core/Shared/Util/MapUtil";
import { Signal } from "@Easy/Core/Shared/Util/Signal";
import BlockSoundManager from "Code/BlockSound/BlockSoundManager";
import ItemManager from "Code/Item/ItemManager";
import { ItemType } from "Code/Item/ItemType";
import WorldManager from "Code/World/WorldManager";
import BlockDataManager from "./BlockDataManager";
import BlockPredictionManager from "./BlockPredictionManager";
import { BlockUtil } from "./BlockUtil";

export class BlockDamageEvent extends Cancellable {
	constructor(public position: Vector3, public player: Player | undefined, public blockId: number) {
		super();
	}

	public GetItemType() {
		return ItemManager.Get().GetItemTypeFromVoxelId(this.blockId);
	}
}

export default class BlockHitManager extends AirshipSingleton {
	private readonly cooldownMarginInSeconds = 0.1;
	/** lastCommandId is used to map the block damage to this client's timeline */
	public blockDamagedNS = new NetworkSignal<
		[
			placerConnId: number | undefined,
			voxelPosition: Vector3,
			hitPosition: Vector3,
			hitNormal: Vector3,
			block: number | undefined,
			damageDealt: number,
			blockHealth: number,
		]
	>("BlockDamaged");
	public onBlockDamage = new Signal<BlockDamageEvent>();
	/** Map for player to timestamps of recent damages. Used for cooldown tracking */
	private lastActionTickServer = new Map<Player, number>();
	private lastActionTickClient = new Map<Player, number>();
	/** Map for player to number of times the user has perfectly timed their item swing
	 * Used to detect abuse of the margin the server gives clients on their item cooldowns
	 */
	private marginHits = new Map<Player, number>();
	@NonSerialized()
	public localTimeSinceLastUse = 0;
	@NonSerialized()
	public isLocalBlockQueued = false;

	public swingSound: AudioResource;
	public swingAnim: AnimationClip;
	public destroyedVfx: GameObject;
	public negatedDebrisVfx: GameObject;

	public hitBlockNetSig = new NetworkSignal<[blockPosition: Vector3, hitPoint: Vector3, normal: Vector3]>("BlockHit");
	private destroyBlockNetSig = new NetworkSignal<
		[positions: Vector3[], voxelDatas: number[], characterId: number | undefined]
	>("DestroyBlock");

	public readonly onBlockDestroyedServer = new Signal<
		[blockPos: Vector3, blockId: number, character: Character | undefined]
	>();

	override Start(): void {
		if (Game.IsClient()) this.StartClient();
		if (Game.IsServer()) this.StartServer();
	}

	public StartServer() {
		this.hitBlockNetSig.server.OnClientEvent((player, blockPos, hitPoint, normal) => {
			if (!player.character) return;

			const redirectedPosition = BlockUtil.GetRedirectedBlockPosition(blockPos);
			const voxelData = WorldManager.Get().currentWorld.GetVoxelAt(redirectedPosition);
			const hitBlockId = BlockUtil.VoxelDataToBlockId(voxelData);

			// Make sure we aren't on cooldown
			if (!this.ValidateActionCooldown(player, AirshipSimulationManager.Instance.tick, true, true)) {
				// warn("client trying to swing while being on cooldown: " + player.username);
				return false;
			}

			// Validate distance to block is within max reach
			if (hitBlockId !== undefined && blockPos !== undefined) {
				const eyePosition = player.character.transform.position.add(new Vector3(0, 1.5, 0));
				const sqrDistanceToBlock = eyePosition.sub(blockPos).sqrMagnitude;
				// Add 1.5 unit tolerance to account for: network character mismatch + crouch offset + small buffer
				const maxReachWithTolerance = BlockUtil.maxBlockReach + 1.5;
				if (sqrDistanceToBlock > maxReachWithTolerance * maxReachWithTolerance) {
					return false;
				}

				// Validate block is exposed to air
				// if (!this.IsBlockExposedToAir(blockPos)) {
				// 	return false;
				// }
			}

			//Replicate to observers
			BlockHitManager.Get().blockDamagedNS.server.FireExcept(
				player,
				player.connectionId,
				redirectedPosition,
				hitPoint,
				normal,
				hitBlockId,
				1,
				0,
			);

			this.DestroyBlockServer(hitBlockId, voxelData, blockPos, player.character, true);
		});
	}

	public StartClient() {
		// Observers listen to block hits
		this.blockDamagedNS.client.OnServerEvent(
			(connectionId, voxelPosition, hitPosition, hitNormal, blockId, damageDealt, newHealth) => {
				const blockDamager = connectionId ? Airship.Players.FindByConnectionId(connectionId) : undefined;
				if (!blockDamager) {
					// Missing damager
					return;
				}

				if (blockDamager.IsLocalPlayer()) {
					// The initiating player doesn't need to trigger any effects again
					BlockPredictionManager.Get().ClearPrediction(voxelPosition);
					return;
				}

				const vw = WorldManager.Get().currentWorld;

				//Local event for block damage
				if (blockId) {
					this.onBlockDamage.Fire(new BlockDamageEvent(voxelPosition, blockDamager, blockId));
					this.DestroyBlockClient(
						blockId,
						vw.GetVoxelAt(voxelPosition),
						voxelPosition,
						blockDamager.character,
					);
				}

				//Can only play the correct effects if we have a character and can look up their item
				if (blockDamager.character) {
					this.DamageBlockClientObserver(
						blockDamager.character,
						voxelPosition,
						hitPosition,
						hitNormal,
						blockId,
						damageDealt,
						newHealth,
					);
				}
			},
		);
	}

	public GetSpeedModifier(character: Character) {
		return 1;
	}

	private DestroyBlockClient(
		blockId: number,
		voxelData: number,
		position: Vector3,
		destroyer: Character | undefined,
		priority = true,
		destroyOnlyImmediatelyUpdatesCollisions?: boolean,
	) {
		let containedPositions: Vector3[] = [position];
		const blockItemType = ItemManager.Get().GetItemTypeFromVoxelId(blockId);
		if (blockItemType !== undefined && BlockUtil.HasContainedVoxels(blockItemType)) {
			const flipBits = VoxelWorld.GetVoxelFlippedBits(voxelData);
			const rot = VoxelWorld.FlipBitsToQuaternion(flipBits);
			containedPositions = BlockUtil.GetContainedVoxels(blockItemType, position, rot);
		}

		// if we're hosting these will be deleted on the "server" side
		if (!Game.IsHosting()) {
			const vw = WorldManager.Get().currentWorld;
			for (const containedPos of containedPositions) {
				if (destroyOnlyImmediatelyUpdatesCollisions) {
					vw.WriteTemporaryVoxelCollisionAt(containedPos, 0);
				}
				vw.WriteVoxelAt(containedPos, 0, destroyOnlyImmediatelyUpdatesCollisions ? false : priority);
			}
		}

		// Effects
		if (blockId !== 0) {
			this.PlayBlockBreakEffect(blockId, position);
		}
	}

	private DestroyBlockServer(
		blockId: number,
		voxelData: number,
		position: Vector3,
		character: Character | undefined,
		priority = true,
	) {
		let containedPositions: Vector3[] = [position];
		const blockItemType = ItemManager.Get().GetItemTypeFromVoxelId(blockId);
		if (blockItemType !== undefined && BlockUtil.HasContainedVoxels(blockItemType)) {
			const flipBits = VoxelWorld.GetVoxelFlippedBits(voxelData);
			const rot = VoxelWorld.FlipBitsToQuaternion(flipBits);
			containedPositions = BlockUtil.GetContainedVoxels(blockItemType, position, rot);
		}

		for (const containedPosition of containedPositions) {
			BlockDataManager.Get().UnregisterBlockData(containedPosition);
			WorldManager.Get().currentWorld.WriteVoxelAt(containedPosition, 0, priority);
		}
		this.onBlockDestroyedServer.Fire(position, blockId, character);

		this.destroyBlockNetSig.server.FireAllClients([position], [voxelData], character?.id);
	}

	public PlayBlockBreakEffect(blockType: number, position: Vector3) {
		const itemType = ItemManager.Get().GetItemTypeFromVoxelId(blockType);
		if (itemType) {
			BlockSoundManager.Get().PlayBreakSound(itemType, position);
		}
	}

	/**
	 * Validates wether an action can go through. If this returns true it will register the action to
	 * the action list (as long as registerNewAction is true).
	 * @returns True if action can go through
	 */
	public ValidateActionCooldown(
		player: Player | undefined,
		tick: number,
		registerNewAction: boolean,
		asServer: boolean,
	): boolean {
		const itemData = player?.character?.heldItem?.itemDef.data?.blockBreaker;
		if (!itemData) {
			return false;
		}
		const lastActionTick = MapUtil.GetOrCreate(
			asServer ? this.lastActionTickServer : this.lastActionTickClient,
			player,
			0,
		);
		//Make sure we have a breaking item
		//Make sure the cooldown is up
		const cooldown = itemData.secsPerHit / this.GetSpeedModifier(player.character!);
		let lenientCooldown = cooldown;
		const elapsedTime = (tick - lastActionTick) * Time.fixedDeltaTime;
		if (asServer) {
			print("server.1");
			if (registerNewAction) {
				print("server.2");
				//Check against hackers abusing the margin of error
				let marginHits = MapUtil.GetOrCreate(this.marginHits, player, 0);
				if (elapsedTime < cooldown && cooldown - elapsedTime <= this.cooldownMarginInSeconds) {
					print("server.3");
					//Was in margin of error
					marginHits++;
					//print("Hit perfect margin hit " + marginHits + " times on tick: " + tick);
					if (marginHits > 3) {
						print("server.4");
						//Too good to use
						if (marginHits > 6) {
							//This is neferiaus behaviour
							warn("Hacker detected abusing block hitting: " + player.userId);
						}
						return false;
					}
					this.marginHits.set(player, marginHits);
				} else if (elapsedTime > cooldown) {
					//We didnt hit a perfect hit this tick
					marginHits--;
					//print("Normal hit " + marginHits + " times on tick: " + tick);
					this.marginHits.set(player, math.max(0, marginHits));
				}
			}
			//Add a 4 frame margin for error on the server so it feels better with a small amount of lag
			lenientCooldown -= this.cooldownMarginInSeconds;
		}
		print("cooldown.1 (server: " + asServer + ")");
		if (elapsedTime >= lenientCooldown) {
			print("cooldown.2 (server: " + asServer + ")");
			if (registerNewAction) {
				(asServer ? this.lastActionTickServer : this.lastActionTickClient).set(player, tick);
				if (player.IsLocalPlayer() && !Game.IsServer) {
					this.localTimeSinceLastUse = 0;
				}
			}
			return true;
		}
		return false;
	}

	private DamageBlockClientObserver(
		character: Character,
		voxelPosition: Vector3,
		hitPosition: Vector3,
		hitNormal: Vector3,
		blockId: number | undefined,
		damageDealt: number,
		newHealth: number,
	) {
		this.PlayHitEffect(
			character,
			voxelPosition,
			hitPosition,
			hitNormal,
			blockId,
			damageDealt === 0,
			newHealth === 0,
		);
	}

	public PlayHitEffect(
		character: Character,
		voxelPosition: Vector3,
		hitBlockPos: Vector3,
		normal: Vector3,
		blockId: number | undefined,
		damageNegated: boolean,
		destroyed: boolean,
	) {
		// NOTE: If `damageNegated` is true, that means that we're hitting a block that is either not breakable
		// (usually a map block) or a block that is inside of a deny region.

		//Play animation on the character
		character.animationHelper.PlayAnimation(this.swingAnim, CharacterAnimationLayer.UPPER_BODY_1, 0);

		const heldItemType = character.heldItem?.itemType as ItemType;
		const src = AudioManager.PlayClipAtPosition(this.swingSound, character.model.transform.position);
		src?.transform.SetParent(character.model.transform);

		//No target then we just swung in the air and don't play any effects
		if (!blockId) {
			return;
		}

		// Extend raycast a bit so we end up inside the block
		const posInBlock = hitBlockPos.add(normal.mul(0.15));
		const blockPos = voxelPosition.add(Vector3.one.mul(0.5));

		// Delay for impact
		task.delay(0.05, () => {
			// ScreenShakeManager.Get().Shake(new Vector3(-1, -0.5, 0));
			const blockItemType = ItemManager.Get().GetItemTypeFromVoxelId(blockId);
			if (damageNegated) {
				BlockSoundManager.Get().PlayHitNegatedSound(voxelPosition, blockItemType);

				if (this.negatedDebrisVfx) {
					const debris = PoolManager.SpawnObject(
						this.negatedDebrisVfx,
						posInBlock,
						Quaternion.LookRotation(Vector3.up),
					);
					task.delay(5, () => {
						PoolManager.ReleaseObject(debris);
					});
				}

				return;
			}
			const percentDestroyed = 1;

			if (blockItemType) {
				BlockSoundManager.Get().PlayHitSound(blockItemType, voxelPosition, math.clamp01(1 - percentDestroyed));
			}

			// if (!destroyed) {
			// 	if (this.refs.debrisVfx !== undefined) {
			// 		const debris = PoolManager.SpawnObject(
			// 			this.refs.debrisVfx,
			// 			posInBlock,
			// 			Quaternion.LookRotation(Vector3.up),
			// 		);
			// 		task.delay(5, () => {
			// 			PoolManager.ReleaseObject(debris);
			// 		});
			// 	}
			// 	if (this.refs.sparkVfx !== undefined) {
			// 		const sparks = PoolManager.SpawnObject(
			// 			this.refs.sparkVfx,
			// 			posInBlock,
			// 			Quaternion.LookRotation(Vector3.up),
			// 		);
			// 		task.delay(3, () => {
			// 			PoolManager.ReleaseObject(sparks);
			// 		});
			// 	}
			// }

			if (destroyed && this.destroyedVfx !== undefined) {
				const debris = PoolManager.SpawnObject(
					this.destroyedVfx,
					blockPos,
					Quaternion.LookRotation(Vector3.up),
				);
				task.delay(5, () => {
					PoolManager.ReleaseObject(debris);
				});
			}
		});
	}
}
