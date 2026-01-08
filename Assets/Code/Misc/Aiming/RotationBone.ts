export default class RotationBone extends AirshipBehaviour {
	@Header("Bone Setup")
	public aimBone!: Transform;
	public rotationInputEuler: Vector3;
	public offset: Vector3;

	@Header("Limit Rotation")
	public minRotation: Vector3;
	public maxRotation: Vector3;

	@Header("Influence")
	@Range(0, 1)
	public influence = 1.0;

	override Awake(): void {
		this.aimBone = this.gameObject.transform;
	}

	override Update(): void {
		this.rotationInputEuler = new Vector3(
			math.clamp(this.rotationInputEuler.x, this.minRotation.x, this.maxRotation.x),
			math.clamp(this.rotationInputEuler.y, this.minRotation.y, this.maxRotation.y),
			math.clamp(this.rotationInputEuler.z, this.minRotation.z, this.maxRotation.z),
		);
	}
}
