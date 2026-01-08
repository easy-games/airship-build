export class MobileUtil {
	/**
	 * Checks if a specific touch position is over UI elements by performing a raycast.
	 * @param touchPosition The screen position of the touch (in pixels)
	 * @returns True if the touch position is over a UI element
	 */
	public static IsTouchPositionOverUI(touchPosition: Vector2): boolean {
		const eventSystem = EventSystem.current;
		if (!eventSystem) return false;

		const pointerData = new PointerEventData(eventSystem);
		pointerData.position = touchPosition;
		const raycastResults = eventSystem.RaycastAll(pointerData);

		// Check if we hit any UI elements
		for (let i = 0; i < raycastResults.size(); i++) {
			const result = raycastResults[i];
			try {
				if (result.gameObject && result.gameObject.layer === LayerMask.NameToLayer("UI")) {
					return true;
				}
			} catch (e) {
				// If access is denied from a protected UI object, just return true
				return true;
			}
		}

		return false;
	}
}
