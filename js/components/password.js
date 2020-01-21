Fliplet.FormBuilder.field('password', {
  name: 'Password input',
  category: 'Text inputs',
  props: {
    placeholder: {
      type: String
    },
    hash: {
      type: Boolean,
      default: false
    },
    autogenerate: {
      type: Boolean,
      default: false
    },
    autogenerateLength: {
      type: Number,
      default: 10
    },
    confirm: {
      type: Boolean,
      default: false
    },
    valueConfirmation: {
      type: String
    },
    hasConfirmationError: {
      type: Boolean,
      default: false
    },
    saveProgress: {
      type: Boolean,
      default: false
    },
    populateOnUpdate: {
      type: Boolean,
      default: false
    },
    submitWhenFalsy: {
      type: Boolean,
      default: false
    },
    toggleReadonly: {
      type: Boolean,
      default: true
    }
  },
  validations: function () {
    var rules = {
      value: {},
      valueConfirmation: {}
    };

    if (this.required) {
      rules.value.required = window.validators.required;
    }

    if (this.confirm) {
      rules.valueConfirmation.sameAs = window.validators.sameAs('value');
    }

    return rules;
  },
  computed: {
    fieldPlaceholder: function () {
      return this.autogenerate ? 'A password will be automatically generated' : this.placeholder;
    }
  },
  mounted: function () {
    if (this.autogenerate && !this.value) {
      this.value = this.generateRandomPassword(this.autogenerateLength);
      this.updateValue();
    }
  },
  methods: {
    generateRandomPassword: function (length) {
      var alphabet = 'abcdefghijklmnopqrstuvwxyz!#$%&*-ABCDEFGHIJKLMNOP1234567890';
      var password = '';

      for (var x = 0; x < length; x++) {
        password += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      }

      return password;
    },
    updateConfirmation: function () {
      this.$v.valueConfirmation.$touch();
      this.highlightError();
    },
    onFocus: function () {
      this.toggleReadonly = false;
    }
  }
});
