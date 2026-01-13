import { Airship } from "@Easy/Core/Shared/Airship";
import Character from "@Easy/Core/Shared/Character/Character";
import { Game } from "@Easy/Core/Shared/Game";
import WorldManager from "./World/WorldManager";

export default class CharacterRespawner extends AirshipSingleton {
	public voidYHeight = -20;

	override Start(): void {
		if (Game.IsServer()) {
			// Respawn characters when they die
			Airship.Damage.onDeath.Connect((damageInfo) => {
				const character = damageInfo.gameObject.GetAirshipComponent<Character>();
				character?.Despawn();

				if (character?.player) {
					const world = WorldManager.Get().GetLoadedWorldFromPlayer(character.player);
					if (world) {
						WorldManager.Get().MovePlayerToLoadedWorld(character.player, world);
					}
				}
			});
		}
	}

	protected FixedUpdate(dt: number): void {
		if (!Game.IsServer()) return;

		for (const character of Airship.Characters.GetCharacters()) {
			if (character.transform.position.y <= this.voidYHeight) {
				if (character.player) {
					const world = WorldManager.Get().GetLoadedWorldFromPlayer(character.player);
					if (world) {
						const loc = world.GetSpawnLocation();
						character.Teleport(loc.position, loc.forward);
					}
				}
			}
		}
	}
}
