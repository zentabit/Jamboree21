/*!
 * VisualEditor UserInterface IndentationAction class.
 *
 * @copyright 2011-2019 VisualEditor Team and others; see http://ve.mit-license.org
 */

/**
 * Indentation action.
 *
 * @class
 * @extends ve.ui.Action
 *
 * @constructor
 * @param {ve.ui.Surface} surface Surface to act on
 */
ve.ui.IndentationAction = function VeUiIndentationAction() {
	// Parent constructor
	ve.ui.IndentationAction.super.apply( this, arguments );
};

/* Inheritance */

OO.inheritClass( ve.ui.IndentationAction, ve.ui.Action );

/* Static Properties */

ve.ui.IndentationAction.static.name = 'indentation';

/**
 * List of allowed methods for the action.
 *
 * @static
 * @property
 */
ve.ui.IndentationAction.static.methods = [ 'increase', 'decrease' ];

/* Methods */

/**
 * Indent content.
 *
 * @method
 * @return {boolean} Indentation increase occurred
 */
ve.ui.IndentationAction.prototype.increase = function () {
	var i, group, groups,
		fragments = [],
		increased = false,
		surfaceModel = this.surface.getModel(),
		documentModel = surfaceModel.getDocument(),
		fragment = surfaceModel.getFragment();

	if ( !( fragment.getSelection() instanceof ve.dm.LinearSelection ) ) {
		return;
	}

	groups = documentModel.getCoveredSiblingGroups( fragment.getSelection().getRange() );

	// Build fragments from groups (we need their ranges since the nodes will be rebuilt on change)
	for ( i = 0; i < groups.length; i++ ) {
		group = groups[ i ];
		if ( group.grandparent && group.grandparent.getType() === 'list' ) {
			fragments.push( surfaceModel.getLinearFragment( group.parent.getRange(), true ) );
			increased = true;
		}
	}

	// Process each fragment (their ranges are automatically adjusted on change)
	for ( i = 0; i < fragments.length; i++ ) {
		this.indentListItem(
			documentModel.getBranchNodeFromOffset( fragments[ i ].getSelection().getRange().start )
		);
	}

	fragment.select();

	return increased;
};

/**
 * Unindent content.
 *
 * @method
 * @return {boolean} Indentation decrease occurred
 */
ve.ui.IndentationAction.prototype.decrease = function () {
	var i, group, groups,
		fragments = [],
		decreased = false,
		surfaceModel = this.surface.getModel(),
		documentModel = surfaceModel.getDocument(),
		fragment = surfaceModel.getFragment();

	if ( !( fragment.getSelection() instanceof ve.dm.LinearSelection ) ) {
		return;
	}

	groups = documentModel.getCoveredSiblingGroups( fragment.getSelection().getRange() );

	// Build fragments from groups (we need their ranges since the nodes will be rebuilt on change)
	for ( i = 0; i < groups.length; i++ ) {
		group = groups[ i ];
		if ( group.grandparent && group.grandparent.getType() === 'list' ) {
			fragments.push( surfaceModel.getLinearFragment( group.parent.getRange(), true ) );
			decreased = true;
		} else if ( group.parent && group.parent.getType() === 'list' ) {
			// In a slug, the node will be the listItem.
			fragments.push( surfaceModel.getLinearFragment( group.nodes[ 0 ].getRange(), true ) );
			decreased = true;
		}

	}

	// Process each fragment (their ranges are automatically adjusted on change)
	for ( i = 0; i < fragments.length; i++ ) {
		this.unindentListItem(
			documentModel.getBranchNodeFromOffset( fragments[ i ].getSelection().getRange().start )
		);
	}

	fragment.select();

	return decreased;
};

/**
 * Indent a list item.
 *
 * @method
 * @param {ve.dm.ListItemNode} listItem List item to indent
 * @throws {Error} listItem must be a ve.dm.ListItemNode
 */
ve.ui.IndentationAction.prototype.indentListItem = function ( listItem ) {
	var listType, listItemRange,
		mergeStart, mergeEnd,
		surfaceModel = this.surface.getModel(),
		documentModel = surfaceModel.getDocument(),
		fragment = surfaceModel.getFragment();

	if ( !( listItem instanceof ve.dm.ListItemNode ) ) {
		throw new Error( 'listItem must be a ve.dm.ListItemNode' );
	}
	/*
	 * Indenting a list item is done as follows:
	 *
	 * 1. Wrap the listItem in a list and a listItem (<li> --> <li><ul><li>)
	 * 2. Merge this wrapped listItem into the previous listItem if present
	 *    (<li>Previous</li><li><ul><li>This --> <li>Previous<ul><li>This)
	 * 3. If this results in the wrapped list being preceded by another list,
	 *    merge those lists.
	 */
	if ( !( fragment.getSelection() instanceof ve.dm.LinearSelection ) ) {
		return;
	}

	listType = listItem.getParent().getAttribute( 'style' );
	listItemRange = listItem.getOuterRange();

	// CAREFUL: after initializing the variables above, we cannot use the model tree!
	// The first transaction will cause rebuilds so the nodes we have references to now
	// will be detached and useless after the first transaction. Instead, inspect
	// documentModel.data to find out things about the current structure.

	// (1) Wrap the listItem in a list and a listItem
	surfaceModel.getLinearFragment( listItemRange, true )
		.wrapNodes( [ { type: 'listItem' }, { type: 'list', attributes: { style: listType } } ] );

	// (2) Merge the listItem into the previous listItem (if there is one)
	if (
		documentModel.data.getData( listItemRange.start ).type === 'listItem' &&
		documentModel.data.getData( listItemRange.start - 1 ).type === '/listItem'
	) {
		mergeStart = listItemRange.start - 1;
		mergeEnd = listItemRange.start + 1;
		// (3) If this results in adjacent lists, merge those too
		if (
			documentModel.data.getData( mergeEnd ).type === 'list' &&
			documentModel.data.getData( mergeStart - 1 ).type === '/list'
		) {
			mergeStart--;
			mergeEnd++;
		}
		surfaceModel.getLinearFragment( new ve.Range( mergeStart, mergeEnd ), true ).removeContent();
	}

	// TODO If this listItem has a child list, split&unwrap it

	fragment.select();
};

/**
 * Unindent a list item.
 *
 * TODO: Refactor functionality into {ve.dm.SurfaceFragment}.
 *
 * @method
 * @param {ve.dm.ListItemNode} listItem List item to unindent
 * @throws {Error} listItem must be a ve.dm.ListItemNode
 */
ve.ui.IndentationAction.prototype.unindentListItem = function ( listItem ) {
	var tx, i, length, children, child, splitListRange,
		fragment, list, listElement, grandParentType, listItemRange,
		surfaceModel = this.surface.getModel(),
		documentModel = surfaceModel.getDocument();

	if ( !( listItem instanceof ve.dm.ListItemNode ) ) {
		throw new Error( 'listItem must be a ve.dm.ListItemNode' );
	}

	fragment = surfaceModel.getLinearFragment( listItem.getOuterRange(), true );
	list = listItem.getParent();
	listElement = list.getClonedElement();
	grandParentType = list.getParent().getType();
	listItemRange = listItem.getOuterRange();

	/*
	 * Outdenting a list item is done as follows:
	 * 1. Split the parent list to isolate the listItem in its own list
	 * 1a. Split the list before the listItem if it's not the first child
	 * 1b. Split the list after the listItem if it's not the last child
	 * 2. If this isolated list's parent is not a listItem, unwrap the listItem and the isolated list, and stop.
	 * 3. Split the parent listItem to isolate the list in its own listItem
	 * 3a. Split the listItem before the list if it's not the first child
	 * 3b. Split the listItem after the list if it's not the last child
	 * 4. Unwrap the now-isolated listItem and the isolated list
	 */
	// TODO: Child list handling, gotta figure that out.
	// CAREFUL: after initializing the variables above, we cannot use the model tree!
	// The first transaction will cause rebuilds so the nodes we have references to now
	// will be detached and useless after the first transaction. Instead, inspect
	// documentModel.data to find out things about the current structure.

	// (1) Split the listItem into a separate list
	if ( documentModel.data.getData( listItemRange.start - 1 ).type !== 'list' ) {
		// (1a) listItem is not the first child, split the list before listItem
		tx = ve.dm.TransactionBuilder.static.newFromInsertion( documentModel, listItemRange.start,
			[ { type: '/list' }, listElement ]
		);
		surfaceModel.change( tx );
		// tx.translateRange( listItemRange ) doesn't do what we want
		listItemRange = listItemRange.translate( 2 );
	}
	if ( documentModel.data.getData( listItemRange.end ).type !== '/list' ) {
		// (1b) listItem is not the last child, split the list after listItem
		tx = ve.dm.TransactionBuilder.static.newFromInsertion( documentModel, listItemRange.end,
			[ { type: '/list' }, listElement ]
		);
		surfaceModel.change( tx );
		// listItemRange is not affected by this transaction
	}
	splitListRange = new ve.Range( listItemRange.start - 1, listItemRange.end + 1 );

	if ( grandParentType !== 'listItem' ) {
		// The user is trying to unindent a list item that's not nested
		// (2) Unwrap both the list and the listItem, dumping the listItem's contents
		// into the list's parent
		surfaceModel.getLinearFragment( new ve.Range( listItemRange.start + 1, listItemRange.end - 1 ), true )
			.unwrapNodes( 2 );

		// Ensure paragraphs are not generated paragraphs now
		// that they are not in a list
		children = fragment.getSiblingNodes();
		for ( i = 0, length = children.length; i < length; i++ ) {
			child = children[ i ].node;
			if ( child.type === 'paragraph' ) {
				ve.deleteProp( child.element, 'internal', 'generated' );
			}
		}
	} else {
		// (3) Split the list away from parentListItem into its own listItem
		// TODO factor common split logic somehow?
		if ( documentModel.data.getData( splitListRange.start - 1 ).type !== 'listItem' ) {
			// (3a) Split parentListItem before list
			tx = ve.dm.TransactionBuilder.static.newFromInsertion( documentModel, splitListRange.start,
				[ { type: '/listItem' }, { type: 'listItem' } ]
			);
			surfaceModel.change( tx );
			// tx.translateRange( splitListRange ) doesn't do what we want
			splitListRange = splitListRange.translate( 2 );
		}
		if ( documentModel.data.getData( splitListRange.end ).type !== '/listItem' ) {
			// (3b) Split parentListItem after list
			tx = ve.dm.TransactionBuilder.static.newFromInsertion( documentModel, splitListRange.end,
				[ { type: '/listItem' }, { type: 'listItem' } ]
			);
			surfaceModel.change( tx );
			// splitListRange is not affected by this transaction
		}

		// (4) Unwrap the list and its containing listItem
		surfaceModel.getLinearFragment( new ve.Range( splitListRange.start + 1, splitListRange.end - 1 ), true )
			.unwrapNodes( 2 );
	}
};

/* Registration */

ve.ui.actionFactory.register( ve.ui.IndentationAction );
