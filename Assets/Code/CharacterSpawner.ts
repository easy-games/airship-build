import { Airship } from "@Easy/Core/Shared/Airship";
import Character from "@Easy/Core/Shared/Character/Character";
import { Game } from "@Easy/Core/Shared/Game";
import { ItemStack } from "@Easy/Core/Shared/Inventory/ItemStack";
import { Player } from "@Easy/Core/Shared/Player/Player";
import { ItemType } from "./Item/ItemType";

export default class CharacterSpawner extends AirshipSingleton {
	public voidYHeight = -20;

	override Start(): void {
		if (Game.IsServer()) {
			// Fired when players join the game
			Airship.Players.ObservePlayers((player) => {
				this.SpawnCharacterForPlayer(player);
			});

			// Respawn characters when they die
			Airship.Damage.onDeath.Connect((damageInfo) => {
				const character = damageInfo.gameObject.GetAirshipComponent<Character>();
				character?.Despawn();
				if (character?.player) {
					character.player.SpawnCharacter(this.transform.position, {
						lookDirection: this.transform.forward,
					});
				}
			});
		}
	}

	protected FixedUpdate(dt: number): void {
		for (const character of Airship.Characters.GetCharacters()) {
			if (character.transform.position.y <= this.voidYHeight) {
				character.Teleport(this.transform.position, this.transform.forward);
			}
		}
	}

	public SpawnCharacterForPlayer(player: Player): void {
		const character = player.SpawnCharacter(this.transform.position, {
			lookDirection: this.transform.forward,
		});

		const inv = character.inventory;
		inv.AddItem(new ItemStack(ItemType.Dirt));
		inv.AddItem(new ItemStack(ItemType.Stone));
	}
}
