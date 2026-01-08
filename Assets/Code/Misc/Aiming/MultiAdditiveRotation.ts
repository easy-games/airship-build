import Character from "@Easy/Core/Shared/Character/Character";
import { Game } from "@Easy/Core/Shared/Game";
import { BasicEasingFunction, TweenEasingFunction } from "@Easy/Core/Shared/Tween/EasingFunctions";
import { LuauTween, Tween } from "@Easy/Core/Shared/Tween/Tween";
import { SetInterval } from "@Easy/Core/Shared/Util/Timer";
import CacheManager from "../CacheManager";
import RotationBone from "./RotationBone";

const allComponents: MultiAdditiveRotation[] = [];
if (Game.IsClient()) {
	SetInterval(0.5, () => {
		const camPos = CacheManager.Get().mainCameraPosition;
		for (const comp of allComponents) {
			if (comp.transform.position.sub(camPos).magnitude <= 40) {
				comp.enabled = true;
			} else {
				comp.enabled = false;
			}
		}
	});
}

export default class MultiAdditiveRotation extends AirshipBehaviour {
	public character: Character;
	public characterMovement: CharacterMovement;
	public characterRotationPivot: Transform;

	public tweenAim: LuauTween<number>;
	public tweenAimEntry = 0.5;
	public tweenAimExit = 0.5;

	@Range(0, 1)
	public generalInfluence = 1.0;

	public boneList: RotationBone[];

	private targetDirection: Vector3;

	protected Start(): void {
		allComponents.push(this);
	}

	protected OnDestroy(): void {
		allComponents.remove(allComponents.indexOf(this));
	}

	override LateUpdate(): void {
		if (this.character.player === undefined) {
			return;
		}

		this.targetDirection = this.characterMovement.GetLookVector();
		// Converts the target direction to global space, starting from the object's local space
		const globalTargetDirection = this.transform.TransformDirection(this.targetDirection.normalized);

		// if (!this.characterRotationPivot) return;

		//Check if boneList is defined and has elements using size()
		// if (!this.boneList || this.boneList.size() === 0) {
		// 	print("BoneList is either undefined or empty.");
		// 	return;
		// }

		const currentRotation = this.transform.rotation;

		for (const bone of this.boneList) {
			// if (!bone.aimBone) continue;
			const aimBone = bone.aimBone;

			let influence = bone.influence;

			influence = math.max(influence, 0);

			// Calculates the combined influence, ensuring that it is between 0 and 1
			const combinedInfluence = math.clamp01(influence * this.generalInfluence);

			const rotationEuler = bone.rotationInputEuler.add(bone.offset);
			const inputRotation = this.characterRotationPivot.rotation.mul(
				Quaternion.Euler(rotationEuler.x, rotationEuler.y, rotationEuler.z),
			);

			const compensatedRotation = inputRotation
				.mul(Quaternion.Inverse(this.characterRotationPivot.rotation))
				.mul(aimBone.rotation);

			const finalRotation = Quaternion.Slerp(aimBone.rotation, compensatedRotation, combinedInfluence);

			bone.influence = influence;

			aimBone.rotation = finalRotation;

			// TODO: It will need to be adjusted to work with the other rotations. For now it only works with X
			bone.rotationInputEuler = new Vector3(
				this.getViewVectorRotation(currentRotation, globalTargetDirection).x,
				0,
				0,
			);
		}
	}

	private NormalizeAngle(angle: number): number {
		return angle > 180 ? angle - 360 : angle;
	}

	public getViewVectorRotation(currentRotation: Quaternion, globalTargetDirection: Vector3): Vector3 {
		if (this.targetDirection !== Vector3.zero) {
			// Generates a rotation that looks in the direction of the global vector
			const targetRotation = Quaternion.LookRotation(globalTargetDirection);

			// Calculates the difference between the rotations
			const rotationDifference = Quaternion.Inverse(currentRotation).mul(targetRotation);

			// Converts the rotation difference to Euler angles
			const localEulerDifference = rotationDifference.eulerAngles;

			// Normalizes angles to be within the -180 to 180 range
			const normalizedEulerDifference = new Vector3(
				this.NormalizeAngle(localEulerDifference.x),
				this.NormalizeAngle(localEulerDifference.y),
				this.NormalizeAngle(localEulerDifference.z),
			);

			return normalizedEulerDifference;
		}
		return Vector3.zero;
	}

	/**
	 * Smoothly interpolates (tweens) the value of `generalInfluence` between two values over a specified duration,
	 * with an optional delay before starting the interpolation.
	 *
	 * @param startInfluence - The starting value of the influence for interpolation.
	 * @param endInfluence - The ending value of the influence for interpolation.
	 * @param time - The duration of the interpolation in seconds.
	 * @param delay - (Optional) The delay in seconds before starting the interpolation.
	 */
	public AimInfluence(startInfluence: number, endInfluence: number, time: number): void;
	public AimInfluence(startInfluence: number, endInfluence: number, time: number, delay: number): void;
	public AimInfluence(startInfluence: number, endInfluence: number, time: number, delay?: number): void {
		this.tweenAim?.Cancel();

		if (this.enabled) {
			const startValue = startInfluence;
			const endValue = endInfluence;

			let easeFunction: BasicEasingFunction;

			// Entry Ease
			if (startValue < endValue) {
				easeFunction = TweenEasingFunction.OutQuart;
			}
			// Exit Ease
			else {
				easeFunction = TweenEasingFunction.InOutQuart;
			}

			const executeTween = () => {
				this.tweenAim = Tween.Number(
					easeFunction,
					time,
					(val) => {
						this.generalInfluence = val;
					},
					startValue,
					endValue,
				);
			};

			if (delay && delay > 0) {
				task.delay(delay, executeTween);
			} else {
				executeTween();
			}
		}
	}
}
