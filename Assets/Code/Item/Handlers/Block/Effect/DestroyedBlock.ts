export default class DestroyedBlock extends AirshipBehaviour {
	override Start(): void {
		// TODO this should probably just be a particle
		for (let i = 0; i < this.transform.childCount; i++) {
			const child = this.transform.GetChild(i);
			if (math.random() < 0.5) {
				Object.Destroy(child.gameObject);
				continue;
			}

			task.delay(0.5 + math.random() * 0.2, () => {
				NativeTween.LocalScale(child, Vector3.one, 0.6 + math.random() * 0.2).SetEaseQuadOut();
				task.delay(0.55, () => {
					Object.Destroy(child.gameObject);
				});
			});

			child
				.GetComponent<Rigidbody>()
				.AddForce(
					new Vector3(math.random() * 10 - 5, 3.5 * math.random() + 1, math.random() * 10 - 5),
					ForceMode.Impulse,
				);
		}
	}

	override OnDestroy(): void {}
}
