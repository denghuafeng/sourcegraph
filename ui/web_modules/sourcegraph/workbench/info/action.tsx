import { Subscription } from "rxjs";

import { KeyCode, KeyMod } from "vs/base/common/keyCodes";
import { IDisposable } from "vs/base/common/lifecycle";
import { TPromise } from "vs/base/common/winjs.base";
import { editorContribution } from "vs/editor/browser/editorBrowserExtensions";
import { EmbeddedCodeEditorWidget } from "vs/editor/browser/widget/embeddedCodeEditorWidget";
import * as editorCommon from "vs/editor/common/editorCommon";
import { IEditorContribution, IModel } from "vs/editor/common/editorCommon";
import { EditorAction, IActionOptions, ServicesAccessor, editorAction } from "vs/editor/common/editorCommonExtensions";
import { CommonEditorRegistry } from "vs/editor/common/editorCommonExtensions";
import { PeekContext, getOuterEditor } from "vs/editor/contrib/zoneWidget/browser/peekViewWidget";
import { ContextKeyExpr } from "vs/platform/contextkey/common/contextkey";
import { IEditorService } from "vs/platform/editor/common/editor";
import { KeybindingsRegistry } from "vs/platform/keybinding/common/keybindingsRegistry";

import { DefinitionData, fetchDependencyReferences, provideDefinition, provideGlobalReferences, provideReferences, provideReferencesCommitInfo } from "sourcegraph/util/RefsBackend";
import { ReferencesModel } from "sourcegraph/workbench/info/referencesModel";
import { infoStore } from "sourcegraph/workbench/info/sidebar";

import ModeContextKeys = editorCommon.ModeContextKeys;

interface Props {
	editorModel: IModel;
	lspParams: {
		position: {
			line: number,
			character: number
		},
	};
};

const OpenInfoPanelID: string = "editor.contrib.openInfoPanel";

@editorContribution
export class ReferenceAction implements IEditorContribution {
	private toDispose: IDisposable[] = [];

	public getId(): string {
		return OpenInfoPanelID;
	}

	public dispose(): void {
		this.toDispose.forEach(disposable => disposable.dispose());
	}

}

export class DefinitionActionConfig {
	constructor(
		public sideBarID: string = "",
	) {
		//
	}
}

export class DefinitionAction extends EditorAction {

	private _configuration: DefinitionActionConfig;
	private globalFetchSubscription?: Promise<Subscription | undefined>;

	constructor(configuration: DefinitionActionConfig, opts: IActionOptions) {
		super(opts);
		this._configuration = configuration;
	}

	public run(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): TPromise<void> {
		const editorService = accessor.get(IEditorService);
		const outerEditor = getOuterEditor(accessor, {});

		editor.onDidChangeModel(event => {
			let oldModel = event.oldModelUrl;
			let newModel = event.newModelUrl;
			if (oldModel.toString() !== newModel.toString()) {
				this.prepareInfoStore(false, "");
			}
		});

		this.highlightSymbol(editor);

		return TPromise.as(this.onResult(editorService, editor, outerEditor));
	}

	async renderSidePanelForData(props: Props): Promise<Subscription | undefined> {
		const defDataP = provideDefinition(props.editorModel, props.lspParams.position);
		const referenceInfoP = provideReferences(props.editorModel, props.lspParams.position);
		const defData = await defDataP;
		const id = this._configuration.sideBarID;
		if (!defData) {
			return;
		}
		this.dispatchInfo(id, defData);

		const referenceInfo = await referenceInfoP;
		if (this._configuration.sideBarID !== id) {
			return;
		}
		if (!referenceInfo || referenceInfo.length === 0) {
			this.dispatchInfo(id, defData, null);
			return;
		}

		let refModel = await provideReferencesCommitInfo(new ReferencesModel(referenceInfo, props.editorModel.uri));
		if (this._configuration.sideBarID !== id) {
			return;
		}
		this.dispatchInfo(id, defData, refModel);

		// Only fetch global refs for Go.
		if (props.editorModel.getModeId() !== "go") {
			return;
		}

		const depRefs = await fetchDependencyReferences(props.editorModel, props.lspParams.position);
		if (!depRefs || this._configuration.sideBarID !== id) {
			return;
		}

		refModel = new ReferencesModel(referenceInfo, props.editorModel.uri);
		if (!refModel) {
			return;
		}

		this.dispatchInfo(id, defData, refModel);

		let concatArray = referenceInfo;
		return provideGlobalReferences(props.editorModel, depRefs).subscribe(async refs => {
			concatArray = concatArray.concat(refs);

			refModel = new ReferencesModel(concatArray, props.editorModel.uri);

			if (!refModel) {
				return;
			}

			refModel = await provideReferencesCommitInfo(refModel);
			if (!refModel) {
				return;
			}

			this.dispatchInfo(id, defData, refModel);
		});
	}

	private prepareInfoStore(prepare: boolean, id: string): void {
		if (!prepare && this.globalFetchSubscription) {
			this.globalFetchSubscription.then(sub => sub && sub.unsubscribe());
		}
		infoStore.dispatch({ defData: null, prepareData: { open: prepare }, id });
	}

	private dispatchInfo(id: string, defData: DefinitionData, refModel?: ReferencesModel | null): void {
		if (id === this._configuration.sideBarID) {
			infoStore.dispatch({ defData, refModel, id });
		} else if (this.globalFetchSubscription) {
			this.globalFetchSubscription.then(sub => sub && sub.unsubscribe());
		}
	}

	private onResult(editorService: IEditorService, editor: editorCommon.ICommonCodeEditor, outerEditor: editorCommon.ICommonCodeEditor): void {
		if (editor instanceof EmbeddedCodeEditorWidget) {
			this._configuration.sideBarID = editor.getModel().uri.toString() + editor.getPosition().lineNumber + ":" + editor.getPosition().column;
			this.prepareInfoStore(true, this._configuration.sideBarID);
			editorService.openEditor({
				resource: editor.getModel().uri,
				options: {
					selection: editor.getSelection(),
					revealIfVisible: true,
				}
			}, true).then(nextEditor => {
				this.prepareInfoStore(true, this._configuration.sideBarID);
				this.openInPeek(editorService, editor);
			});

			return;
		}

		if (ContextKeyExpr.and(ModeContextKeys.hasDefinitionProvider, PeekContext.notInPeekEditor)) {
			this._configuration.sideBarID = editor.getModel().uri.toString() + editor.getPosition().lineNumber + ":" + editor.getPosition().column;
			this.prepareInfoStore(true, this._configuration.sideBarID);
			this.openInPeek(editorService, editor);
		}
	}

	private openInPeek(editorService: IEditorService, target: editorCommon.ICommonCodeEditor): void {
		this.globalFetchSubscription = this.renderSidePanelForData({
			editorModel: target.getModel(),
			lspParams: {
				position: {
					line: target.getPosition().lineNumber - 1,
					character: target.getPosition().column - 1,
				},
			},
		});
	}

	private highlightSymbol(editor: editorCommon.ICommonCodeEditor): void {
		const pos = editor.getPosition();
		const model = editor.getModel();

		const { startColumn, endColumn } = model.getWordAtPosition(pos);
		const wordRange = {
			startLineNumber: pos.lineNumber,
			startColumn: startColumn,
			endLineNumber: pos.lineNumber,
			endColumn: endColumn,
		};
		editor.setSelection(wordRange);
	}
}

@editorAction
export class GoToDefinitionAction extends DefinitionAction {

	public static ID: string = "editor.action.openSidePanel";

	constructor() {
		super(new DefinitionActionConfig(), {
			id: GoToDefinitionAction.ID,
			label: "Open Side Panel",
			alias: "Open Side Panel",
			precondition: ModeContextKeys.hasDefinitionProvider,
		});
	}
}

function closeActiveReferenceSearch(): void {
	infoStore.dispatch({ defData: null, prepareData: { open: false }, id: "" });
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: "closeSidePaneWidget",
	weight: CommonEditorRegistry.commandWeight(-202),
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape | KeyCode.Delete], // tslint:disable-line
	when: ContextKeyExpr.and(ContextKeyExpr.not("config.editor.stablePeek")),
	handler: closeActiveReferenceSearch
});
