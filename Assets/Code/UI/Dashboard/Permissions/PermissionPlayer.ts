import { Airship } from "@Easy/Core/Shared/Airship";
import { Player } from "@Easy/Core/Shared/Player/Player";
import { Bin } from "@Easy/Core/Shared/Util/Bin";
import SoundUtil from "Code/Misc/SoundUtil";
import Dashboard from "../Dashboard";

export default class PermissionPlayer extends AirshipBehaviour {
	public bg: GameObject;
	public grantBtn: Button;
	public revokeBtn: Button;
	public avatarImg: RawImage;
	public usernameText: TMP_Text;

	private hasBuildPermission = false;

	private uid: string;
	private bin = new Bin();

	protected Awake(): void {
		this.SetHasBuildPermission(false);
	}

	public InitPlayer(player: Player): void {
		this.uid = player.userId;
		this.SetUsername(player.username);
		this.LoadImage();
	}

	public InitOfflinePlayer(userId: string): void {
		this.uid = userId;
		this.SetUsername(userId);
		this.LoadImage();
	}

	private async LoadImage() {
		const tex = await Airship.Players.GetProfilePictureAsync(this.uid);
		this.avatarImg.color = Color.white;
		this.avatarImg.texture = tex;
	}

	public SetUsername(username: string): void {
		this.usernameText.text = username;
	}

	public SetHasBuildPermission(val: boolean): void {
		this.hasBuildPermission = val;

		if (val) {
			this.grantBtn.gameObject.SetActive(false);
			this.revokeBtn.gameObject.SetActive(true);
			this.bg.gameObject.SetActive(true);
		} else {
			this.grantBtn.gameObject.SetActive(true);
			this.revokeBtn.gameObject.SetActive(false);
			this.bg.gameObject.SetActive(false);
		}
	}

	public HasBuildPermission(): boolean {
		return this.hasBuildPermission;
	}

	override Start(): void {
		this.bin.Add(
			this.grantBtn.onClick.Connect(() => {
				SoundUtil.PlayClick();
				Dashboard.Get().setBuildPermissionNetSig.client.FireServer(this.uid, true);
				this.SetHasBuildPermission(true);
			}),
		);
		this.bin.Add(
			this.revokeBtn.onClick.Connect(() => {
				SoundUtil.PlayClick();
				Dashboard.Get().setBuildPermissionNetSig.client.FireServer(this.uid, false);
				this.SetHasBuildPermission(false);
			}),
		);
	}

	override OnDestroy(): void {}
}
