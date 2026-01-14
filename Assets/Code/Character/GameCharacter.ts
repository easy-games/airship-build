import Character from "@Easy/Core/Shared/Character/Character";

export default class GameCharacter extends AirshipBehaviour {
	public character: Character;

	private lockedRotation: boolean = false;
	private unlockedRotationValue: number;

	override Start(): void {
		if (this.character.IsLocalCharacter()) {
			this.character.SetHeldSlot(1);
			this.character.SetHeldSlot(0);
		}
	}

	override OnDestroy(): void {}

	LockCharacterRotation(locked: boolean) {
		if (this.lockedRotation === locked) {
			return;
		}

		if (locked) {
			this.lockedRotation = true;
			this.unlockedRotationValue = this.character.movement.headRotationThreshold;
			this.character.movement.headRotationThreshold = 0;
		} else {
			this.lockedRotation = false;
			this.character.movement.headRotationThreshold = this.unlockedRotationValue;
		}
	}
}
