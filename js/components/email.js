Fliplet.FormBuilder.field('email', {
  name: 'Email input',
  category: 'Text inputs',
  props: {
    placeholder: {
      type: String
    },
    toggleReadonly: {
      type: Boolean,
      default: true
    }
  },
  validations: function() {
    var rules = {
      value: {
        email: window.validators.email
      }
    };

    if (this.required) {
      rules.value.required = window.validators.required;
    }
    return rules;
  },
  methods: {
    onFocus: function () {
      this.toggleReadonly = false;
    }
  }
});
