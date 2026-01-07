interface CustomAudioConfigSettings {
	/**
	 * Optional custom min distance override
	 */
	customMinDistance?: number;
	/**
	 * Optional custom max distance override
	 */
	customMaxDistance?: number;
	/**
	 * Optional flag to disable distance culling for example looping sounds that should not be culled.
	 */
	doNotDistanceCull?: boolean;
}

export default class SoundManager extends AirshipSingleton {
	/** Bedwars Audio Mixer */
	public audioMixer: AudioMixer;

	@Header("Fast access mixer groups")
	public damageDealtGroup: AudioMixerGroup;
	public itemUseGroup: AudioMixerGroup;
	public gameUIGroup: AudioMixerGroup;
	public kitAbilityGroup: AudioMixerGroup;
	public projectileGroup: AudioMixerGroup;

	@Header("Audio Rolloff Presets")
	@Tooltip("Close range sounds - weapons, footsteps, close combat")
	public closeRangeRolloff = new AnimationCurve([
		new Keyframe(0, 1, -2, -2, 0, 0.5),
		new Keyframe(0.3, 0.6, -1.5, -1.5, 0.3, 0.3),
		new Keyframe(0.7, 0.2, -0.8, -0.8, 0.4, 0.2),
		new Keyframe(1, 0, -0.2, -0.2, 0.3, 0),
	]);
	public closeRangeRolloffMinDistance = 0;
	public closeRangeRolloffMaxDistance = 10;

	@Tooltip("Mid close range sounds - projectiles, abilities, environmental")
	public midCloseRangeRolloff = new AnimationCurve([
		new Keyframe(0, 1, -1, -1, 0, 0.5),
		new Keyframe(0.3, 0.6, -0.8, -0.8, 0.3, 0.3),
		new Keyframe(0.7, 0.2, -0.5, -0.5, 0.4, 0.2),
		new Keyframe(1, 0, -0.2, -0.2, 0.3, 0),
	]);
	public midCloseRangeRolloffMinDistance = 0;
	public midCloseRangeRolloffMaxDistance = 15;

	@Tooltip("Medium range sounds - projectiles, abilities, environmental")
	public mediumRangeRolloff = new AnimationCurve([
		new Keyframe(0, 1.00148, -1.71403, -1.71403, 0, 0.6212256),
		new Keyframe(0.05987129, 0.7603495, -4.352651, -4.352651, 0.331629, 0.085671),
		new Keyframe(0.3286559, 0.1997433, -0.871482, -0.871482, 0.2815668, 0.03713613),
		new Keyframe(1, 0, -0.05521388, -0.05521388, 0.2485877, 0),
	]);
	public mediumRangeRolloffMinDistance = 0;
	public mediumRangeRolloffMaxDistance = 20;

	@Tooltip("Far range sounds - explosions, distant combat, ambient")
	public farRangeRolloff = new AnimationCurve([
		new Keyframe(0, 1, -0.8, -0.8, 0, 0.8),
		new Keyframe(0.4, 0.6, -0.6, -0.6, 0.4, 0.2),
		new Keyframe(1, 0, -0.1, -0.1, 0.3, 0),
	]);
	public farRangeRolloffMinDistance = 0;
	public farRangeRolloffMaxDistance = 50;

	@Tooltip("Very far range sounds - large explosions, boss sounds")
	public veryFarRangeRolloff = new AnimationCurve([
		new Keyframe(0, 1, -0.4, -0.4, 0, 0.9),
		new Keyframe(0.6, 0.7, -0.3, -0.3, 0.5, 0.3),
		new Keyframe(1, 0, -0.05, -0.05, 0.4, 0),
	]);
	public veryFarRangeRolloffMinDistance = 0;
	public veryFarRangeRolloffMaxDistance = 500;

	/**
	 * Get the rolloff curve based on sound type
	 * @param soundType The type of sound to get rolloff for
	 * @returns The appropriate AnimationCurve for the sound type
	 */
	public GetRolloffForSoundType(soundType: AudioRolloffType): AnimationCurve {
		switch (soundType) {
			case AudioRolloffType.Close:
				return this.closeRangeRolloff;
			case AudioRolloffType.MidClose:
				return this.midCloseRangeRolloff;
			case AudioRolloffType.Medium:
				return this.mediumRangeRolloff;
			case AudioRolloffType.Far:
				return this.farRangeRolloff;
			case AudioRolloffType.VeryFar:
				return this.veryFarRangeRolloff;
			default:
				return this.mediumRangeRolloff;
		}
	}

	/**
	 * Get recommended distance settings for a sound type
	 * @param rolloffType The type of rolloff to get distances for
	 * @returns Object with minDistance and maxDistance
	 */
	public GetDistanceRange(rolloffType: AudioRolloffType): { minDistance: number; maxDistance: number } {
		switch (rolloffType) {
			case AudioRolloffType.Close:
				return {
					minDistance: this.closeRangeRolloffMinDistance,
					maxDistance: this.closeRangeRolloffMaxDistance,
				};
			case AudioRolloffType.MidClose:
				return {
					minDistance: this.midCloseRangeRolloffMinDistance,
					maxDistance: this.midCloseRangeRolloffMaxDistance,
				};
			case AudioRolloffType.Medium:
				return {
					minDistance: this.mediumRangeRolloffMinDistance,
					maxDistance: this.mediumRangeRolloffMaxDistance,
				};
			case AudioRolloffType.Far:
				return {
					minDistance: this.farRangeRolloffMinDistance,
					maxDistance: this.farRangeRolloffMaxDistance,
				};
			case AudioRolloffType.VeryFar:
				return {
					minDistance: this.veryFarRangeRolloffMinDistance,
					maxDistance: this.veryFarRangeRolloffMaxDistance,
				};
			default:
				return {
					minDistance: this.mediumRangeRolloffMinDistance,
					maxDistance: this.mediumRangeRolloffMaxDistance,
				};
		}
	}

	/**
	 * Get a complete audio configuration object for a sound type
	 * @param rolloffType The type of rolloff to get config for
	 * @param customAudioConfigSettings Optional settings for the audio config
	 * @returns Object with rolloffCustomCurve, minDistance, and maxDistance
	 */
	public GetAudioConfig(rolloffType: AudioRolloffType, customAudioConfigSettings?: CustomAudioConfigSettings) {
		const distances = this.GetDistanceRange(rolloffType);
		return {
			rolloffCustomCurve: SoundManager.Get().GetRolloffForSoundType(rolloffType),
			minDistance: customAudioConfigSettings?.customMinDistance ?? distances.minDistance,
			maxDistance: customAudioConfigSettings?.customMaxDistance ?? distances.maxDistance,
			distanceCulling: customAudioConfigSettings?.doNotDistanceCull
				? undefined
				: customAudioConfigSettings?.customMaxDistance ?? distances.maxDistance,
		};
	}
}

export enum AudioRolloffType {
	Close = "Close",
	MidClose = "MidClose",
	Medium = "Medium",
	Far = "Far",
	VeryFar = "VeryFar",
}
