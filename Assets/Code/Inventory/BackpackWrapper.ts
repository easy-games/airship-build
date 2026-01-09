export default class BackpackWrapper extends AirshipBehaviour {
	protected OnEnable(): void {
		const rect = this.transform as RectTransform;
		rect.anchoredPosition = rect.anchoredPosition.WithY(-20);
		NativeTween.AnchoredPositionY(rect, 0, 0.18).SetEaseQuadOut();
	}
}
