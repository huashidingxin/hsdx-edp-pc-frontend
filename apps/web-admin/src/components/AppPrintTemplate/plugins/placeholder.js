import {
  ClassicEditor,
  Bold,
  Italic,
  Essentials,
  Heading,
  List,
  Paragraph,
  Command,
  Plugin,
  Widget,
  toWidget,
  viewToModelPositionOutsideModelElement,
  ViewModel,
  addListToDropdown,
  addMenuToDropdown,
  createDropdown,
  BodyCollection,
  Collection,
} from 'ckeditor5';

// import './theme/placeholder.css';
export default class Placeholder extends Plugin {
  static get requires() {
    return [ PlaceholderEditing, PlaceholderUI ];
  }
}

class PlaceholderCommand extends Command {
  execute( { key,name } ) {
    const editor = this.editor;
    const selection = editor.model.document.selection;

    editor.model.change( writer => {
      // Create a <placeholder> element with the "name" attribute (and all the selection attributes)...
      const placeholder = writer.createElement( 'placeholder', {
        ...Object.fromEntries( selection.getAttributes() ),
        key: key,
        name: name
      } );

      // ... and insert it into the document. Put the selection on the inserted element.
      editor.model.insertObject( placeholder, null, null, { setSelection: 'on' } );
    } );
  }

  refresh() {
    const model = this.editor.model;
    const selection = model.document.selection;

    const isAllowed = model.schema.checkChild( selection.focus.parent, 'placeholder' );

    this.isEnabled = isAllowed;
  }
}

class PlaceholderUI extends Plugin {
  init() {
    const editor = this.editor;
    const t = editor.t;
    const placeholderModels = editor.config.get( 'placeholderConfig.models' );
    console.log('@####',placeholderModels)

    // The "placeholder" dropdown must be registered among the UI components of the editor
    // to be displayed in the toolbar.
    editor.ui.componentFactory.add( 'placeholder', locale => {
      const dropdownView = createDropdown( editor.locale );
      //const definitions = new BodyCollection(locale); // Can be `editor.ui.view.body`.
      const definitions = new Collection(); // Can be `editor.ui.view.body`.

      placeholderModels.forEach((model)=>{
        let children = []
        if(model.children){
          model.children.forEach((child)=>{
            children.push({
              id:model.key+'.'+child.key,
              label:model.name+':'+child.name
            })
          })
        }
        let item = {
          id:model.key,
        };
        if(children.length){
          item.menu = model.name
          item.children = children
        }else{
          item.label = model.name
        }

        definitions.add(item)
      })

      addMenuToDropdown( dropdownView, editor.ui.view.body, definitions );

      // Populate the list in the dropdown with items.
       //addListToDropdown( dropdownView, getDropdownItemsDefinitions( placeholderModels ) );

      dropdownView.buttonView.set( {
        // The t() function helps localize the editor. All strings enclosed in t() can be
        // translated and change when the language of the editor changes.
        label: '表单插值',
        tooltip: true,
        withText: true
      } );

      // Disable the placeholder button when the command is disabled.
      const command = editor.commands.get( 'placeholder' );
      dropdownView.bind( 'isEnabled' ).to( command );

      //document.getElementById( 'menu-dropdown' ).append( dropdownView.element );

      // Execute the command when the dropdown item is clicked (executed).
      this.listenTo( dropdownView, 'execute', evt => {
        editor.execute( 'placeholder', { key: evt.source.id,name: evt.source.label} );
        editor.editing.view.focus();
      } );

      return dropdownView;
    } );
  }
}


function getDropdownItemsDefinitions( placeholderModels ) {
  const itemDefinitions = new Collection();

  // for ( const model of placeholderModels ) {
  //   const definition = {
  //     type: 'button',
  //     label: model.name,
  //     id: model.key
  //   };
  //
  //   // Add the item definition to the collection.
  //   itemDefinitions.add( definition );
  // }


  return itemDefinitions;
}

class PlaceholderEditing extends Plugin {
  static get requires() {
    return [ Widget ];
  }

  init() {
    console.log( 'PlaceholderEditing#init() got called' );

    this._defineSchema();
    this._defineConverters();

    this.editor.commands.add( 'placeholder', new PlaceholderCommand( this.editor ) );

    this.editor.editing.mapper.on(
      'viewToModelPosition',
      viewToModelPositionOutsideModelElement( this.editor.model, viewElement => viewElement.hasClass( 'placeholder' ) )
    );
    this.editor.config.define( 'placeholderConfig', {
      models: [{key:'test',name:'演示值'}]
    } );
  }

  _defineSchema() {
    const schema = this.editor.model.schema;

    schema.register( 'placeholder', {
      // Behaves like a self-contained inline object (e.g. an inline image)
      // allowed in places where $text is allowed (e.g. in paragraphs).
      // The inline widget can have the same attributes as text (for example linkHref, bold).
      inheritAllFrom: '$inlineObject',

      // The placeholder can have many types, like date, name, surname, etc:
      allowAttributes: [ 'name','key' ]
    } );
  }

  _defineConverters() {
    const conversion = this.editor.conversion;

    conversion.for( 'upcast' ).elementToElement( {
      view: {
        name: 'span',
        classes: [ 'placeholder' ]
      },
      model: ( viewElement, { writer: modelWriter } ) => {
        // Extract the "name" from "{name}".
        console.log('22222@@@@',viewElement.getChild(0).data)
        const name = viewElement.getChild( 0 ).data.slice( 1, -1 );

        return modelWriter.createElement( 'placeholder', { name } );
      }
    } );

    conversion.for( 'editingDowncast' ).elementToElement( {
      model: 'placeholder',
      view: ( modelItem, { writer: viewWriter } ) => {
        const widgetElement = createPlaceholderView( modelItem, viewWriter );

        // Enable widget handling on a placeholder element inside the editing view.
        return toWidget( widgetElement, viewWriter );
      }
    } );

    conversion.for( 'dataDowncast' ).elementToElement( {
      model: 'placeholder',
      view: ( modelItem, { writer: viewWriter } ) => createPlaceholderView( modelItem, viewWriter )
    } );

    // Helper method for both downcast converters.
    function createPlaceholderView( modelItem, viewWriter ) {
      const name = modelItem.getAttribute( 'name' );
      const key = modelItem.getAttribute( 'key' );

      const placeholderView = viewWriter.createContainerElement( 'abbr', {
        class: 'placeholder',
        title:name,
        'data-key':key
      } );

      // Insert the placeholder name (as a text).
      const innerText = viewWriter.createText( '{' + key + '}' );
      viewWriter.insert( viewWriter.createPositionAt( placeholderView, 0 ), innerText );

      return placeholderView;
    }
  }
}
