use crate::errors::Error;

/// Checked i128 addition; returns Error::Overflow on overflow.
pub fn add(a: i128, b: i128) -> Result<i128, Error> {
    a.checked_add(b).ok_or(Error::Overflow)
}

/// Checked i128 subtraction; returns Error::Overflow on overflow.
pub fn sub(a: i128, b: i128) -> Result<i128, Error> {
    a.checked_sub(b).ok_or(Error::Overflow)
}

/// Checked i128 multiplication; returns Error::Overflow on overflow.
pub fn mul(a: i128, b: i128) -> Result<i128, Error> {
    a.checked_mul(b).ok_or(Error::Overflow)
}

/// Checked i128 division; returns Error::Overflow on overflow (incl. divide by zero).
pub fn div(a: i128, b: i128) -> Result<i128, Error> {
    a.checked_div(b).ok_or(Error::Overflow)
}

/// `(a * b) / c` with intermediate overflow protection. Floors.
/// Used for linear interpolation: `base * (now - cliff) / (end - cliff)`.
pub fn mul_div(a: i128, b: i128, c: i128) -> Result<i128, Error> {
    let prod = mul(a, b)?;
    div(prod, c)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_ok() {
        assert_eq!(add(1, 2).unwrap(), 3);
    }

    #[test]
    fn add_overflow() {
        assert!(matches!(add(i128::MAX, 1), Err(Error::Overflow)));
    }

    #[test]
    fn sub_ok() {
        assert_eq!(sub(10, 4).unwrap(), 6);
    }

    #[test]
    fn sub_overflow() {
        assert!(matches!(sub(i128::MIN, 1), Err(Error::Overflow)));
    }

    #[test]
    fn mul_ok() {
        assert_eq!(mul(7, 6).unwrap(), 42);
    }

    #[test]
    fn mul_overflow() {
        assert!(matches!(mul(i128::MAX, 2), Err(Error::Overflow)));
    }

    #[test]
    fn div_by_zero() {
        assert!(matches!(div(10, 0), Err(Error::Overflow)));
    }

    #[test]
    fn mul_div_floors() {
        // 7 * 3 / 2 = 21 / 2 = 10 (floors).
        assert_eq!(mul_div(7, 3, 2).unwrap(), 10);
    }

    #[test]
    fn mul_div_handles_large() {
        // Multiplies first; (1e30 * 1e18) overflows i128 even before the divide.
        assert!(matches!(
            mul_div(10i128.pow(30), 10i128.pow(18), 10i128.pow(18)),
            Err(Error::Overflow)
        ));
    }
}
