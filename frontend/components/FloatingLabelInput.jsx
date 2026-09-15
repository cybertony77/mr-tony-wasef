import { useState, useEffect } from 'react';
import { TextInput, PasswordInput } from '@mantine/core';
import classes from '../styles/FloatingLabelInput.module.css';

export function FloatingLabelInput({
  label,
  value,
  onChange,
  type = 'text',
  inputRef,
  shakeKey = 0,
  ...props
}) {
  const [focused, setFocused] = useState(false);
  const [shaking, setShaking] = useState(false);
  const floating = (value && value.trim().length !== 0) || focused || undefined;
  const InputComponent = type === 'password' ? PasswordInput : TextInput;
  const { onFocus, onBlur, classNames, error, ...rest } = props;

  useEffect(() => {
    if (!error) {
      setShaking(false);
      return undefined;
    }
    setShaking(false);
    const frame = requestAnimationFrame(() => {
      setShaking(true);
    });
    const t = setTimeout(() => setShaking(false), 500);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(t);
    };
  }, [error, shakeKey]);

  return (
    <div className={`${classes.root}${shaking ? ` ${classes.shake}` : ''}`}>
      <InputComponent
        {...rest}
        ref={inputRef}
        value={value}
        error={error}
        onChange={onChange}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        classNames={{ input: classes.input, ...(classNames || {}) }}
        data-floating={floating}
        autoComplete="off"
        placeholder=""
      />
      <label
        className={classes.label}
        data-floating={floating}
        data-error={error ? true : undefined}
      >
        {label}
      </label>
    </div>
  );
}
