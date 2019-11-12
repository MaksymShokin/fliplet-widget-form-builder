/* eslint-disable */
var formBuilderInstances = [];

function drawImageOnCanvas(img, canvas) {
  var imgWidth = img.width;
  var imgHeight = img.height;
  var imgRatio = imgWidth / imgHeight;
  var canvasWidth = canvas.width;
  var canvasHeight = canvas.height;
  var canvasRatio = canvasWidth / canvasHeight;
  var context = canvas.getContext('2d');

  // Re-interpolate image draw dimensions based to CONTAIN within canvas
  if (imgRatio < canvasRatio) {
    // IMAGE RATIO is slimmer than CANVAS RATIO, i.e. margin on the left & right
    if (imgHeight > canvasHeight) {
      // Image is taller. Resize image to fit height in canvas first.
      imgHeight = canvasHeight;
      imgWidth = imgHeight * imgRatio;
    }
  } else {
    // IMAGE RATIO is wider than CANVAS RATIO, i.e. margin on the top & bottom
    if (imgWidth > canvasWidth) {
      // Image is wider. Resize image to fit width in canvas first.
      imgWidth = canvasWidth;
      imgHeight = imgWidth / imgRatio;
    }
  }

  var drawX = (canvasWidth > imgWidth) ? (canvasWidth - imgWidth) / 2 : 0;
  var drawY = (canvasHeight > imgHeight) ? (canvasHeight - imgHeight) / 2 : 0;

  context.drawImage(img, drawX, drawY, imgWidth, imgHeight);
}

function addThumbnailToCanvas(imageURI, indexCanvas, self, isFileCanvas) {
  var $vm = self;

  if (!imageURI.match(/^http/)) {
    imageURI = (imageURI.indexOf('base64') > -1)
      ? imageURI
      :'data:image/jpeg;base64,' + imageURI;
  }

  $vm.$nextTick(function () {
    var canvas = isFileCanvas ? $vm.$refs.canvasWrap[indexCanvas].children[0].children[0] : this.$refs.canvas[indexCanvas];
    var context = canvas.getContext('2d');

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    context.clearRect(0, 0, canvas.width, canvas.height);

    var img = new Image();

    img.onload = function imageLoadedFromURI() {
      drawImageOnCanvas(this, canvas);
    };

    img.src = imageURI;
  });
}

Fliplet.Widget.instance('form-builder', function(data) {
  var saveDelay = 1000; // save progress after 1s from last input
  var selector = '[data-form-builder-id="' + data.id + '"]';
  var progressKey = 'form-builder-progress-' + (data.uuid || data.id);

  var entryId = !Fliplet.Env.get('interact') && data.dataSourceId && Fliplet.Navigate.query.dataSourceEntryId;
  var formMode = Fliplet.Navigate.query.mode;
  var entry;

  var formReady;
  var formPromise = new Promise(function (resolve) {
    formReady = resolve;
  });

  if (entryId) {
    entryId = parseInt(entryId, 10) || undefined;
  }

  function getProgress() {
    var progress = localStorage.getItem(progressKey);

    if (!progress) {
      return;
    }

    return JSON.parse(progress);
  }

  function debounce(func, wait, immediate) {
    var timeout;
    return function() {
      var context = this,
        args = arguments;
      var later = function() {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
      var callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func.apply(context, args);
    };
  }

  function getFields(isEditMode) {
    var fields = _.compact(JSON.parse(JSON.stringify(data.fields || [])));
    var progress = getProgress();

    fields.forEach(function (field) {
      field.enabled = true;
    });

    if (fields.length && (data.saveProgress && typeof progress === 'object') || entry) {
      fields.forEach(function(field) {
        if (entry && entry.data && typeof entry.data[field.name] !== 'undefined' && field.populateOnUpdate !== false) {
          if (field._type === "flDate") {
            if (Fliplet.Env.get('platform') === 'web') {
              field.value = moment(entry.data[field.name]).format('DD MMMM YYYY');
            } else {
              field.value = moment(entry.data[field.name]).format('YYYY-MM-DD');
            }
          } else if (field._type === "flCheckbox" && !Array.isArray(entry.data[field.name])) {
            field.value = [];
          } else if (field._type === 'flImage') {
            var img = entry.data[field.name];
            field.value = [];
            if (Array.isArray(img)) {
              field.value = img;
            } else if (typeof img === 'string') {
              field.value.push(img);
            }

            field.value = field.value.map(function (url) {
              return Fliplet.Media.authenticate(url);
            });
          } else if (!field._submit && typeof field._submit !== 'undefined') {
            field.value = field.value;
          } else {
            field.value = entry.data[field.name];
          }

          return field.value;
        }

        if (progress && !isEditMode) {
          var savedValue = progress[field.name];

          if (typeof savedValue !== 'undefined') {
            field.value = savedValue;
          }
        }
      });
    }

    return fields;
  }

  function isFile(value) {
    return value && typeof value.item === 'function';
  }

  var changeListeners = {};

  var $form = new Vue({
    el: $(selector)[0],
    data: function() {
      return {
        isFormValid: false,
        isSent: false,
        isSending: false,
        isSendingMessage: 'Saving data...',
        isLoading: !!entryId,
        isLoadingMessage: 'Retrieving data...',
        isConfigured: !!data.templateId,
        fields: getFields(),
        error: null,
        errors: {},
        isOffline: false,
        isOfflineMessage: '',
        isEditMode: data.dataStore && data.dataStore.indexOf('editDataSource') > -1,
        blockScreen: false
      };
    },
    computed: {
      hasRequiredFields: function() {
        return this.fields.some(function(el) {
          return !!el.required;
        });
      }
    },
    methods: {
      start: function(event) {
        if (event) {
          event.preventDefault();
        }
        this.isSent = false;
      },
      reset: function(trackEvents) {
        if (trackEvents !== false) {
          Fliplet.Analytics.trackEvent({
            category: 'form',
            action: 'reset'
          });
        }

        var $vm = this;

        this.fields.forEach(function(field, index) {
          field.value = data.fields[index].value;
          $vm.triggerChange(field.name, field.value);
        });

        Fliplet.FormBuilder.emit('reset');
        this.$emit('reset');

        $(this.$el).find('input').val('');
        this.triggerBlurEventOnInputs();
      },
      onError: function (fieldName, error) {
        if (!error) {
          if (this.errors[fieldName]) {
            delete this.errors[fieldName];
          }

          return;
        }

        this.errors[fieldName] = error;
      },
      triggerChange: function (fieldName, value) {
        if (changeListeners[fieldName]) {
          changeListeners[fieldName].forEach(function (fn) {
            fn.call(this, value);
          });
        }
      },
      onInput: function (fieldName, value) {
        var $vm = this;

        this.fields.some(function(field) {
          if (field.name === fieldName) {
            field.value = value;
            $vm.triggerChange(fieldName, value);
            return true;
          }
        });

        if (data.saveProgress && typeof this.saveProgress === 'function') {
          this.saveProgress();
        }
      },
      onChange: function (fieldName, fn, runOnBind) {
        var field;

        this.fields.some(function (f) {
          if (f.name === fieldName) {
            field = f;
            return true;
          }
        });

        if (!field) {
          throw new Error('A field with the name ' + fieldName + ' has not been found in this form.');
        }

        if (typeof fn !== 'function') {
          throw new Error('Second argument must be a function');
        }

        if (!changeListeners[fieldName]) {
          changeListeners[fieldName] = [];
        }

        changeListeners[fieldName].push(fn);

        // also run it once for initialisation
        if (runOnBind !== false) {
          fn.call(this, field.value);
        }
      },
      toggleField: function (fieldName, isEnabled) {
        this.fields.some(function (field) {
          if (field.name === fieldName) {
            field.enabled = !!isEnabled;
            return true;
          }
        });
      },
      getWidgetInstanceData: function () {
        return data;
      },
      getField: function (fieldName) {
        var found;

        this.fields.some(function(field) {
          if (field.name === fieldName) {
            found = field;
            return true;
          }
        });

        return found;
      },

      /**
       * Since our validation should check the input when it loses focus (the onBlur event),
       * the .lazy modifier was added, this leads to the data being updated when the input
       * loses the focus. Because of this, there is a problem when the form is submitted by
       * pressing enter instead of the submit button (in this case, the input does not lose
       * focus and its data is not updated) In order to work as expected, we need to manually
       * trigger the blur event on the input paths.
       */
      triggerBlurEventOnInputs: function() {
        $(this.$el).find('input').blur();
      },
      onSubmit: function() {
        var $vm = this;
        var formData = {};

        $vm.triggerBlurEventOnInputs();

        Fliplet.Analytics.trackEvent({
          category: 'form',
          action: 'submit'
        });

        // form validation
        $vm.isFormValid = true;

        $vm.$children.forEach(function (inputField) {

          // checks if component have vuelidate validation object
          if (inputField.$v) {
            inputField.$v.$touch();

            if (inputField.$v.$invalid) {
              $(inputField.$el).addClass('has-error');
              $vm.isFormValid = false;
            }
          }
        });

       if(!$vm.isFormValid){
         return;
       }

        this.isSending = true;

        function appendField(name, value) {
          if (Array.isArray(formData[name])) {
            formData[name].push(value);
          } else if (typeof formData[name] !== 'undefined') {
            formData[name] = [formData[name], value];
          } else {
            formData[name] = value;
          }
        }

        var errorFields = Object.keys(this.errors);
        var fieldErrors = [];
        if (errorFields.length) {
          errorFields.forEach(function (fieldName) {
            fieldErrors.push(errorFields[fieldName]);
          });

          $vm.error = fieldErrors.join('. ');
          $vm.isSending = false;
          return;
        }

        this.fields.forEach(function(field) {
          var value = field.value;
          var type = field._type;

          if (field._submit === false || !field.enabled) {
            return;
          }

          if (field.submitWhenFalsy === false && !value) {
            return;
          }

          if (isFile(value)) {
            // File input
            for (var i = 0; i < value.length; i++) {
              appendField(field.name, value.item(i));
            }
          } else {
            // Remove spaces and dashes from value (when it's a string)
            if (typeof value === 'string' && ['flNumber', 'flTelephone'].indexOf(type) !== -1) {
              value = value.replace(/-|\s/g, '');
            }
            if (type === 'flDate') {
              value = moment(value).format('YYYY-MM-DD');
            }
            // Other inputs
            appendField(field.name, value);
          }
        });

        formPromise.then(function (form) {
          return Fliplet.Hooks.run('beforeFormSubmit', formData, form);
        }).then(function() {
          if (data.dataSourceId) {
            return Fliplet.DataSources.connect(data.dataSourceId);
          }

          return;
        }).then(function(connection) {
          // Append schema as private variable
          formData._flSchema = {};
          $vm.fields.forEach(function(field) {
            if (field.mediaFolderId) {
              formData._flSchema[field.name] = {
                mediaFolderId: field.mediaFolderId
              };
            }
          });

          if (entryId && entry && data.dataSourceId) {
            return connection.update(entryId, formData, {
              offline: false,
              ack: data.linkAction && data.redirect,
              source: data.uuid
            });
          }

          if (data.dataStore && data.dataStore.indexOf('dataSource') > -1 && data.dataSourceId) {
            return connection.insert(formData, {
              offline: data.offline,
              ack: data.linkAction && data.redirect,
              source: data.uuid
            });
          }

          return;
        }).then(function(result) {
          return formPromise.then(function (form) {
            return Fliplet.Hooks.run('afterFormSubmit', { formData: formData, result: result }, form);
          });
        }).then(function() {
          if (data.saveProgress) {
            localStorage.removeItem(progressKey);
          }

          var operation = Promise.resolve();

          // Emails are only sent by the client when data source hooks aren't set
          if (!data.dataSourceId) {
            if (data.emailTemplateAdd && data.onSubmit && data.onSubmit.indexOf('templatedEmailAdd') > -1) {
              operation = Fliplet.Communicate.sendEmail(_.extend({}, data.emailTemplateAdd), formData);
            }

            if (data.emailTemplateEdit && data.onSubmit && data.onSubmit.indexOf('templatedEmailEdit') > -1) {
              operation = Fliplet.Communicate.sendEmail(_.extend({}, data.emailTemplateEdit), formData);
            }
          }

          if (data.generateEmailTemplate && data.onSubmit && data.onSubmit.indexOf('generateEmail') > -1) {
            operation = Fliplet.Communicate.composeEmail(_.extend({}, data.generateEmailTemplate), formData);
          }

          if (data.linkAction && data.redirect) {
            return operation.then(function () {
              Fliplet.Navigate.to(data.linkAction);
            }).catch(function (err) {
              Fliplet.Modal.alert({
                message: Fliplet.parseError(err)
              });
              Fliplet.Navigate.to(data.linkAction);
            })
          }

          $vm.isSent = true;
          $vm.isSending = false;
          $vm.reset(false);
          /**
           * When we try to submit a form in Edge or IE11 and use components date picker and rich text
           * (only in this sequence) we could saw that rich text textarea become empty but there was no
           * message that we successfully submitted the form. That was because Vue wasn't updating view.
           * $forceUpdate solve this issue.
           */
          $vm.$forceUpdate();

          $vm.loadEntryForUpdate();
        }, function(err) {
          console.error(err);
          $vm.error = err.message || err.description || err;
          $vm.isSending = false;
          Fliplet.Hooks.run('onFormSubmitError', { formData: formData, error: err });
        });

        // We might use this code to save the form data locally when going away from the page
        // $(window).unload(function onWindowUnload() {
        //   localStorage.setItem('fl-form-data-' + data.id, this.fields.map(function (field) {
        //     return { name: field.name, value: field.value };
        //   }));
        // });
      },
      loadEntryForUpdate: function(fn) {
        var $vm = this;

        if (entryId || fn) {
          var loadEntry = typeof fn === 'function'
            ? fn(entryId)
            : Fliplet.DataSources.connect(data.dataSourceId, { offline: false }).then(function (ds) {
              return ds.findById(entryId);
            });

          if (loadEntry instanceof Promise === false) {
            loadEntry = Promise.resolve(loadEntry);
          }

          return loadEntry.then(function (record) {
            if (!record) {
              $vm.error = 'This entry has not been found';
            }

            if (typeof record === 'object' && typeof record.data === 'undefined') {
              record = { data: record };
            }

            entry = record;

            $vm.fields = getFields(true);
            $vm.isLoading = false;
            $vm.$forceUpdate();
          }).catch(function (err) {
            var error = Fliplet.parseError(err);
            $vm.error = error;
            $vm.isLoading = false;
            $vm.$forceUpdate();

            Fliplet.UI.Toast.error(error, {
              message: 'Unable to load entry'
            });
          });
        }

        if (formMode === 'add') {
          return Promise.resolve();
        }

        if (data.autobindProfileEditing) {
          return Fliplet.Session.get().then(function (session) {
            var isEditMode = false;

            if (session.entries && session.entries.dataSource) {
              entryId = 'session'; // this works because you can use it as an ID on the backend
              entry = session.entries.dataSource;
              isEditMode = true;
            }

            // Re-render fields
            $vm.fields = [];
            return new Promise(function (resolve) {
              setTimeout(function () {
                $vm.fields = getFields(isEditMode);
                $vm.isLoading = false;
                resolve();
              }, 50);
            });
          });
        }

        return Promise.resolve();
      }
    },
    mounted: function() {
      var $vm = this;

      this.saveProgress = debounce(function() {
        var progress = {};

        $vm.fields.forEach(function(field) {
          if (field.saveProgress !== false && field.enabled) {
            progress[field.name] = field.value;
          }
        });

        localStorage.setItem(progressKey, JSON.stringify(progress));
      }, saveDelay);

      $(selector).removeClass('is-loading');

      if (!data.offline) {
        Fliplet.Navigator.onOnline(function() {
          $vm.isOffline = false;
          $vm.blockScreen = false;
        });

        Fliplet.Navigator.onOffline(function() {
          $vm.isOffline = true;
          $vm.isOfflineMessage = data.dataStore && data.dataStore.indexOf('editDataSource') > -1 ?
            'The data can only be updated when connected to the internet.' :
            'This form can only be submitted when connected to the internet.';

          if ($vm.isEditMode && $vm.isLoading && $vm.isOffline) {
            $vm.blockScreen = true;
          }
        });
      }

      this.loadEntryForUpdate().then(function () {
        var debouncedUpdate = _.debounce(function () {
          $form.$forceUpdate();
        }, 10);

        // This data is available through "Fliplet.FormBuilder.get()"
        formReady({
          name: data.name,
          instance: $form,
          data: function () {
            return data;
          },
          load: function (fn) {
            return $form.loadEntryForUpdate(fn);
          },
          on: function (event, fn) {
            return $form.$on(event, fn);
          },
          fields: {
            get: function () {
              return $form.fields;
            },
            set: function (fields) {
              if (!Array.isArray(fields)) {
                throw new Error('fields must be an array');
              }

              data.fields = fields;
              $form.fields = getFields();
            }
          },
          field: function (key) {
            var field = $form.getField(key);

            if (!field) {
              throw new Error('The field ' + key + ' has not been found.');
            }

            return {
              val: function (value) {
                if (typeof value === 'undefined') {
                  return field.value;
                }

                field.value = value;
                debouncedUpdate();
              },
              set: function (data) {
                var result;

                if (typeof data === 'function') {
                  data = { source: 'function', key: data };
                }

                if (typeof data !== 'object') {
                  data = { source: 'literal', key: data };
                }

                switch (data.source) {
                  case 'profile':
                    if (!data.key) {
                      throw new Error('A key is required to fetch data from the user\'s profile');
                    }

                    result = Fliplet.Profile.get(data.key);
                    break;
                  case 'query':
                    if (!data.key) {
                      throw new Error('A key is required to fetch data from the navigation query parameters');
                    }

                    result = Fliplet.Navigate.query[data.key];
                    break;
                  case 'storage':
                  case 'appstorage':
                    if (!data.key) {
                      throw new Error('A key is required to fetch data from the storage');
                    }

                    var storage = data.source === 'storage'
                      ? Fliplet.Storage
                      : Fliplet.App.Storage;
                    result = storage.get(data.key);
                    break;
                  case 'function':
                    result = data.key();
                    break;
                  case 'literal':
                    result = data.key;
                    break;
                  default:
                    result = data;
                }

                if (!(result instanceof Promise)) {
                  result = Promise.resolve(result);
                }

                return result.then(function (value) {
                  if (typeof value === 'undefined') {
                    value = '';
                  }

                  field.value = value;
                  debouncedUpdate();
                });
              },
              get: function() {
                return field.value;
              },
              change: function (fn, runOnBind) {
                return $form.onChange(field.name, fn, runOnBind);
              },
              toggle: function (isEnabled) {
                field.enabled = !!isEnabled;

                if (!field.enabled) {
                  JSON.parse(JSON.stringify(data.fields || [])).some(function (f) {
                    if (field.name === f.name) {
                      field.value = f.value;
                      return true;
                    }
                  });
                }
              },
              options: function (values) {
                if (!Array.isArray(values)) {
                  throw new Error('Options must be an array');
                }

                var options = values.map(function (option) {
                  if (typeof option === 'object') {
                    if (typeof option.value !== 'undefined') {
                      option.id = option.value;
                    }

                    return option;
                  }

                  return { id: option };
                });

                // Update options in field definition so they are kept between renderings
                _.find(data.fields, { name: field.name }).options = options;

                // Update live field
                field.options = options;
              }
            };
          }
        });
      });
    }
  });

  formBuilderInstances.push(formPromise);
});

Fliplet.FormBuilder.get = function (name) {
  return Promise.all(formBuilderInstances).then(function (forms) {
    var form;

    if (typeof name === 'undefined') {
      form = forms.length ? forms[0] : undefined;
    } else {
      forms.some(function (vueForm) {
        if (vueForm.name === name) {
          form = vueForm;
          return true;
        }
      });
    }

    return form;
  });
};

Fliplet.FormBuilder.getAll = function () {
  return Promise.all(formBuilderInstances);
};
